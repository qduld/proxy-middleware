import express from "express";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";

// 加载 SSL 证书
const options = {
    key: fs.readFileSync("/path/to/your/private.key"), // 私钥路径
    cert: fs.readFileSync("/path/to/your/certificate.crt"), // 证书路径
};

// 启动 HTTPS 服务
https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS 代理服务器已启动：https://localhost:${PORT}`);
});

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

app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: "缺少 url 参数" });
    }

    try {
        const response = await fetch(targetUrl);

        if (!response.ok) {
            return res.status(response.status).json({ error: "目标资源不可用" });
        }

        // 获取 Content-Type 并设置到响应头部
        const contentType = response.headers.get("content-type");
        res.set("Content-Type", contentType);

        // 如果是 SVG，直接以文本形式返回
        if (contentType.includes("svg")) {
            const svgData = await response.text(); // 使用 text() 方法获取 SVG 数据
            res.send(svgData);
        } else {
            // 对于其他图片格式，使用 buffer() 方法获取二进制数据
            const buffer = await response.buffer();
            res.send(buffer);
        }
    } catch (err) {
        console.error("代理请求失败：", err);
        res.status(500).json({ error: "代理请求失败" });
    }
});

app.listen(PORT, () => {
    console.log(`代理服务器已启动：http://localhost:${PORT}`);
});
