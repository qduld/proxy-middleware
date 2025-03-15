import express from "express";
import fetch from "node-fetch";
import https from "https";
import http from "http";
import fs from "fs";
import { WebSocket, WebSocketServer } from "ws";

// 加载 SSL 证书
// const options = {
//     key: fs.readFileSync("/etc/letsencrypt/live/franklinzelo.duckdns.org/privkey.pem"), // 私钥路径
//     cert: fs.readFileSync("/etc/letsencrypt/live/franklinzelo.duckdns.org/fullchain.pem"), // 证书路径
// };

// 加载 SSL 证书
// const options = {
//     key: fs.readFileSync("D:\\OpenSSL-Win64\\key.pem"), // 私钥路径
//     cert: fs.readFileSync("D:\\OpenSSL-Win64\\cert.pem"), // 证书路径
// };

const app = express();
const PORT = 8989;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // 允许所有来源访问
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); // 允许的方法
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization"); // 允许的头部

    // 如果是预检请求，直接返回 204
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

const cache = new Map();

// 添加缓存项，设置过期时间为 1 小时
function setCache(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + 60 * 60 * 1000 }); // 1 小时后过期
}

// 获取缓存项，检查是否过期
function getCache(key) {
    const cachedItem = cache.get(key);
    if (cachedItem && cachedItem.expiresAt > Date.now()) {
        return cachedItem.value;
    }
    cache.delete(key); // 删除过期缓存
    return null;
}

// 定期清理过期缓存
setInterval(() => {
    for (const [key, cachedItem] of cache.entries()) {
        if (cachedItem.expiresAt < Date.now()) {
            cache.delete(key);
        }
    }
}, 60 * 1000); // 每分钟清理一次

app.use('/node', (req, res, next) => {
    // 处理所有以 /node 开头的请求
    next();
});

app.get("/node/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: "缺少 url 参数" });
    }

    // 检查缓存
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

        // 缓存数据
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
        ws.close(4001, "Unauthorized"); // 关闭连接，返回错误码
        return;
    }

    console.log(`Client authenticated with token: ${token}`);

    // 存储前端客户端信息
    frontendClients.set(ws, { token });

    // 连接到 Go 后台，并在请求头中添加 Token
    const wsBackend = new WebSocket(goBackendUrl, {
        headers: {
            token, // 将 Token 添加到请求头
        },
    });

    wsBackend.onopen = () => {
        console.log("Connected to Go backend");
    };

    wsBackend.onmessage = (message) => {
        try {
            const data = JSON.parse(message.data);
            console.log("Received from Go backend:", data);

            // 将 Go 后台的响应转发回前端
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

    // 监听前端消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log("Received message from frontend:", data);

            // 转发消息到 Go 后台
            if (wsBackend.readyState === WebSocket.OPEN) {
                wsBackend.send(JSON.stringify(data));
            } else {
                console.error("Go backend is not connected");
            }
        } catch (e) {
            console.error("Message handling error:", e);
        }
    });

    // 前端断开连接
    ws.on('close', () => {
        console.log('Frontend client disconnected');
        frontendClients.delete(ws);
        wsBackend.close(); // 断开与 Go 后台的连接
    });
});

// 启动 HTTP 服务
const server = http.createServer(app);

// 将 WebSocket 服务器挂载到 HTTP 服务器
server.on('upgrade', (request, socket, head) => {
    wssFrontend.handleUpgrade(request, socket, head, (ws) => {
        wssFrontend.emit('connection', ws, request);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP 代理服务器已启动：http://localhost:${PORT}`);
});

// 启动 HTTPS 服务
// https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
//     console.log(`HTTPS 代理服务器已启动：https://localhost:${PORT}`);
// });

// 启动 HTTP 服务并将请求重定向到 HTTPS
// http.createServer((req, res) => {
//     res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
//     res.end();
// }).listen(80, () => {
//     console.log("HTTP 重定向服务已启动：http://localhost:80");
// });