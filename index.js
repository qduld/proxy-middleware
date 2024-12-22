import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 8989;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: "缺少 url 参数" });
    }

    try {
        const response = await fetch(targetUrl);
        const contentType = response.headers.get("content-type");

        res.set("Content-Type", contentType);
        response.body.pipe(res);
    } catch (err) {
        console.error("代理请求失败：", err);
        res.status(500).json({ error: "代理请求失败" });
    }
});

app.listen(PORT, () => {
    console.log(`代理服务器已启动：http://localhost:${PORT}`);
});
