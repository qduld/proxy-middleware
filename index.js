import express from "express";
import fetch from "node-fetch";
import https from "https";
import http from "http";
import fs from "fs";
import { WebSocket, WebSocketServer } from "ws";

// 加载 SSL 证书
const options = {
    key: fs.readFileSync("/etc/letsencrypt/live/franklinzelo.duckdns.org/privkey.pem"), // 私钥路径
    cert: fs.readFileSync("/etc/letsencrypt/live/franklinzelo.duckdns.org/fullchain.pem"), // 证书路径
};

// 加载 SSL 证书
// const options = {
//     key: fs.readFileSync("D:\\OpenSSL-Win64\\key.pem"), // 私钥路径
//     cert: fs.readFileSync("D:\\OpenSSL-Win64\\cert.pem"), // 证书路径
// };

const app = express();
const PORT_HTTP = 8989; // HTTP 端口
const PORT_HTTPS = 8990; // HTTPS 端口

// 中间件：允许跨域
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// 缓存逻辑（与原代码相同）
const cache = new Map();

function setCache(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + 60 * 60 * 1000 });
}

function getCache(key) {
    const cachedItem = cache.get(key);
    if (cachedItem && cachedItem.expiresAt > Date.now()) {
        return cachedItem.value;
    }
    cache.delete(key);
    return null;
}

setInterval(() => {
    for (const [key, cachedItem] of cache.entries()) {
        if (cachedItem.expiresAt < Date.now()) {
            cache.delete(key);
        }
    }
}, 60 * 1000);

// 路由：普通 HTTP 请求
app.get("/node/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: "缺少 url 参数" });
    }

    const cachedData = getCache(targetUrl);
    if (cachedData) {
        console.log("从缓存中返回数据");
        res.set("Content-Type", cachedData.contentType);
        return res.send(cachedData.data);
    }

    try {
        const response = await fetch(targetUrl);

        if (!response.ok) {
            return res.status(response.status).json({ error: "目标资源不可用" });
        }

        const contentType = response.headers.get("content-type");
        res.set("Content-Type", contentType);

        let data;
        if (contentType.includes("svg")) {
            data = await response.text();
        } else {
            data = await response.buffer();
        }

        setCache(targetUrl, { data, contentType });

        res.send(data);
    } catch (err) {
        console.error("代理请求失败：", err);
        res.status(500).json({ error: "代理请求失败" });
    }
});

app.get('/node/share', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta property="og:title" content="MyBitFarm  Sow Now,Reap Tokens.">
            <meta property="og:description" content="Welcome to join my team to steal vegetables together!">
            <meta property="og:image" content="https://franklinzelo.duckdns.org/bot_description_picture.png">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:url" content="tg://resolve?domain=MyBitFarmBot&startapp=webapp">
            <meta property="og:description" content="Launch Game ->">
             <meta property="og:description" content="tg://resolve?domain=MyBitFarmBot&startapp=scene=circles">
            <meta name="telegram:card" content="summary_large_image">
            <title>MyBitFarm  Sow Now,Reap Tokens.</title>
        </head>
        <body>
            <h1>MyBitFarm  Sow Now,Reap Tokens.</h1>
            <p>Welcome to join my team to steal vegetables together!</p>
            <button onclick="window.location.href='tg://resolve?domain=MyBitFarmBot&startapp=scene=circles'" 
                    style="background: #4CAF50; color: white; padding: 15px 32px; font-size: 16px; border: none; cursor: pointer;">
                Launch
            </button>
        </body>
        </html>
    `);
});

app.get('/node/test', (req, res) => {
    res.send('Test response');
});

// 创建 WebSocket 服务器（前端连接）
const wssFrontend = new WebSocketServer({ noServer: true });

// 存储所有前端客户端及其 Token
const frontendClients = new Map();

// 连接到 Go 后台的 WebSocket 客户端
const goBackendUrl = "wss://bf.tomocloud.com/ws"; // Go 后台的 WebSocket 地址

// 处理前端 WebSocket 连接
wssFrontend.on('connection', (ws, req) => {
    console.log('New frontend client connected');

    // 从 URL 查询参数中提取 Token
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');

    if (!token) {
        console.error("No token provided, closing connection");
        ws.close(4001, "Unauthorized");
        return;
    }

    console.log(`Client authenticated with token: ${token}`);

    frontendClients.set(ws, { token });

    const wsBackend = new WebSocket(goBackendUrl, {
        headers: {
            token,
        },
    });

    wsBackend.onopen = () => {
        console.log("Connected to Go backend");
    };

    wsBackend.onmessage = (message) => {
        try {
            const data = JSON.parse(message.data);
            console.log("Received from Go backend:", data);

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        } catch (e) {
            console.error("Message parse error:", e);
        }
    };

    wsBackend.onerror = (error) => {
        console.error("WebSocket error with Go backend:", error);
    };

    wsBackend.onclose = () => {
        console.log("Disconnected from Go backend");
    };

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log("Received message from frontend:", data);

            if (wsBackend.readyState === WebSocket.OPEN) {
                wsBackend.send(JSON.stringify(data));
            } else {
                console.error("Go backend is not connected");
            }
        } catch (e) {
            console.error("Message handling error:", e);
        }
    });

    ws.on('close', () => {
        console.log('Frontend client disconnected');
        frontendClients.delete(ws);
        wsBackend.close();
    });
});

// 启动 HTTP 服务
const httpServer = http.createServer(app);

httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
    console.log(`HTTP 服务已启动：http://localhost:${PORT_HTTP}`);
});

// 启动 HTTPS 服务
const httpsServer = https.createServer(options, app);

// 将 WebSocket 服务器挂载到 HTTPS 服务
httpsServer.on('upgrade', (request, socket, head) => {
    wssFrontend.handleUpgrade(request, socket, head, (ws) => {
        wssFrontend.emit('connection', ws, request);
    });
});

httpsServer.listen(PORT_HTTPS, '0.0.0.0', () => {
    console.log(`HTTPS WebSocket 服务已启动：wss://localhost:${PORT_HTTPS}`);
});