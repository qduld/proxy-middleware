import express from "express";
import fetch from "node-fetch";
import https from "https";
import http from "http";
import fs from "fs";

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
            <meta property="og:description" content="Welcome to join my team to steal vegetables together! 👉 [Launch](https://franklinzelo.duckdns.org/farm?scene=circle)">
            <meta property="og:image" content="https://franklinzelo.duckdns.org/bot_description_picture.png">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:url" content="https://franklinzelo.duckdns.org:8989/node/share?scene=circle">
            <meta property="og:type" content="website">
            <title>MyBitFarm  Sow Now,Reap Tokens.</title>
        </head>
        <body>
            <h1>MyBitFarm  Sow Now,Reap Tokens.</h1>
            <p>Welcome to join my team to steal vegetables together!</p>
            <button onclick="window.location.href='https://franklinzelo.duckdns.org/farm?scene=circle'" 
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

app.listen(PORT,'0.0.0.0',  () => {
    console.log(`代理服务器已启动：http://localhost:${PORT}`);
});

// 启动 HTTPS 服务
// https.createServer(options, app).listen(PORT, () => {
//     console.log(`HTTPS 代理服务器已启动：https://localhost:${PORT}`);
// });

// https.createServer(options, app).listen(PORT, "0.0.0.0", () => {
//     console.log(`HTTPS 代理服务器已启动：https://0.0.0.0:${PORT}`);
// });

// 启动 HTTP 服务并将请求重定向到 HTTPS
// http.createServer((req, res) => {
//     res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
//     res.end();
// }).listen(80, () => {
//     console.log("HTTP 重定向服务已启动：http://localhost:80");
// });