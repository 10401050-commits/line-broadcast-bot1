const line = require("@line/bot-sdk");
const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// ====== 廣播設定 ======
const MESSAGE = "📢 這是連續廣播測試";
const BROADCAST_DURATION_MINUTES = 20; // 總共廣播 20 分鐘
const BROADCAST_INTERVAL_SECONDS = 15;  // 每 10 秒廣播一次
const GROUP_IDS = [
  "C210447fed1f03bef4309334d2de7e490" // 改成你的群組 ID，可多群組
];

// ====== 狀態持久化 ======
let broadcastInterval = null;
let broadcastEndTimeout = null;

// 嘗試讀取上次廣播狀態
let isBroadcastOn = false;
try {
  const saved = fs.readFileSync("broadcast_status.json", "utf8");
  const obj = JSON.parse(saved);
  isBroadcastOn = obj.isBroadcastOn || false;
} catch(e){
  // 檔案不存在就當作未廣播
}

// 廣播函數
function broadcastMessage() {
  GROUP_IDS.forEach(groupId => {
    client.pushMessage(groupId, { type: "text", text: MESSAGE })
      .then(() => console.log("✅ 廣播訊息到", groupId))
      .catch(err => console.error(err));
  });
}

// 啟動廣播
function startBroadcast() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (broadcastEndTimeout) clearTimeout(broadcastEndTimeout);

  broadcastMessage(); // 立即廣播一次

  broadcastInterval = setInterval(broadcastMessage, BROADCAST_INTERVAL_SECONDS * 1000);
  broadcastEndTimeout = setTimeout(() => {
    stopBroadcast();
    console.log("⏹ 廣播結束");
    GROUP_IDS.forEach(groupId => {
      client.pushMessage(groupId, { type: "text", text: "⏹ 連續廣播 20 分鐘結束" })
        .catch(err => console.error(err));
    });
  }, BROADCAST_DURATION_MINUTES * 60 * 1000);

  isBroadcastOn = true;
  saveStatus();
}

// 停止廣播
function stopBroadcast() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (broadcastEndTimeout) clearTimeout(broadcastEndTimeout);
  broadcastInterval = null;
  broadcastEndTimeout = null;
  isBroadcastOn = false;
  saveStatus();
}

// 儲存狀態
function saveStatus() {
  fs.writeFileSync("broadcast_status.json", JSON.stringify({isBroadcastOn}), "utf8");
}

// ====== LINE 指令控制 ======
app.post("/webhook", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  const events = req.body.events;
  
  if (!events || events.length === 0) return res.sendStatus(200);

  events.forEach(event => {
    if (event.type !== "message" || !event.message) return;

    const text = event.message.text;
    const replyToken = event.replyToken;

    if (text === "/start") {
      startBroadcast();
      client.replyMessage(replyToken, { type: "text", text: "▶️ 開始連續廣播 20 分鐘，每 10 秒一次" });
    }

    if (text === "/stop") {
      stopBroadcast();
      client.replyMessage(replyToken, { type: "text", text: "⏹ 廣播已停止" });
    }

    if (text === "/status") {
      const status = isBroadcastOn ? "🟢 廣播進行中" : "🔴 廣播已停止";
      client.replyMessage(replyToken, { type: "text", text: status });
    }
  });

  res.sendStatus(200);
});

// ====== Render 監聽 port ======
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("🚀 Bot server running on port", port);

  // Render 重啟時自動恢復廣播
  if (isBroadcastOn) {
    console.log("♻️ 檢測到上次廣播未完成，自動恢復廣播");
    startBroadcast();
  }
});
