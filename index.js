const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require("fs");
const path = require("path");

/* crash protection */

process.on("uncaughtException", err => {
    console.log("Uncaught:", err);
});

process.on("unhandledRejection", err => {
    console.log("Unhandled:", err);
});

const telegramToken = "8654524053:AAErpvhPZDADskFgTcDk1wixOMDtJwPDYEg";

const bot = new TelegramBot(telegramToken, { polling: true });

let client = null;
let userState = {};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log("Test Bot Started...");

/* ================= MENU ================= */

bot.onText(/\/start|\/menu/, (msg) => {

    bot.sendMessage(msg.chat.id, "📋 Control Panel", {

        reply_markup: {
            keyboard: [
                ["🔗 Connect WhatsApp"],
                ["📦 Create Group"],
                ["🚪 Disconnect WhatsApp"]
            ],
            resize_keyboard: true
        }

    });

});

/* ================= CONNECT ================= */

bot.onText(/\/connect/, async (msg) => {

    if (client) {
        bot.sendMessage(msg.chat.id, "Already connected or connecting...");
        return;
    }

    client = new Client({

        authStrategy: new LocalAuth({
            clientId: "testbot"
        }),

        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        }

    });

    client.on("qr", async (qr) => {

        console.log("QR RECEIVED");

        const qrImage = await QRCode.toBuffer(qr);

        bot.sendPhoto(msg.chat.id, qrImage, {
            caption: "Scan QR with WhatsApp"
        });

    });

    client.on("ready", () => {

        console.log("WhatsApp Ready");

        bot.sendMessage(msg.chat.id, "✅ WhatsApp Connected Successfully!");

    });

    client.on("disconnected", () => {

        console.log("WhatsApp Disconnected");

        client = null;

        bot.sendMessage(msg.chat.id, "⚠ WhatsApp Disconnected");

    });

    client.initialize();

});

/* ================= MESSAGE HANDLER ================= */

bot.on("message", async (msg) => {

const chatId = msg.chat.id;

/* CONNECT BUTTON */

if (msg.text === "🔗 Connect WhatsApp") {

    bot.sendMessage(chatId,"Type /connect to start connection");
    return;

}

/* CREATE GROUP BUTTON */

if (msg.text === "📦 Create Group") {

    if (!client) {
        bot.sendMessage(chatId,"❗ Connect WhatsApp first using /connect");
        return;
    }

    userState[chatId] = { step: "askName" };

    bot.sendMessage(chatId,"Enter group name:");

    return;
}

/* DISCONNECT BUTTON */

if (msg.text === "🚪 Disconnect WhatsApp") {

    if (!client) {
        bot.sendMessage(chatId,"WhatsApp not connected");
        return;
    }

    try {

        await client.logout();
        await client.destroy();

    } catch (err) {
        console.log(err);
    }

    client = null;

    const sessionPath = path.join(__dirname, ".wwebjs_auth");

    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    bot.sendMessage(chatId,"🚪 WhatsApp Fully Logged Out");

    return;
}

if (!userState[chatId]) return;

/* ================= GROUP FLOW ================= */

if (userState[chatId].step === "askName") {

    userState[chatId].groupName = msg.text;

    userState[chatId].step = "askQuantity";

    bot.sendMessage(chatId,"Enter quantity:");

    return;
}

if (userState[chatId].step === "askQuantity") {

    const qty = parseInt(msg.text);

    if (isNaN(qty) || qty <= 0) {

        bot.sendMessage(chatId,"❌ Invalid quantity");

        delete userState[chatId];

        return;
    }

    userState[chatId].quantity = qty;

    userState[chatId].step = "askContacts";

    bot.sendMessage(chatId,
        "Send contact numbers separated by comma\nExample:\n919999999999,918888888888\n\nOr type skip"
    );

    return;
}

if (userState[chatId].step === "askContacts") {

    if (msg.text.toLowerCase() === "skip") {

        userState[chatId].contacts = [];

    } else {

        const numbers = msg.text.split(",");

        userState[chatId].contacts = numbers.map(n =>
            n.trim() + "@c.us"
        );
    }

    userState[chatId].step = "askDelay";

    bot.sendMessage(chatId,"Enter delay between groups (seconds):");

    return;
}

if (userState[chatId].step === "askDelay") {

    const delay = parseInt(msg.text);

    if (isNaN(delay) || delay < 1) {

        bot.sendMessage(chatId,"Invalid delay");

        return;
    }

    userState[chatId].delay = delay * 1000;

    userState[chatId].step = "createGroups";

}

/* CREATE GROUPS */

if (userState[chatId].step === "createGroups") {

    const name = userState[chatId].groupName;
    const qty = userState[chatId].quantity;
    const contacts = userState[chatId].contacts;
    const delay = userState[chatId].delay;

    bot.sendMessage(chatId,"Creating groups...");

    try {

        for (let i = 1; i <= qty; i++) {

            await client.createGroup(name + " " + i, contacts);

            bot.sendMessage(chatId,"✅ Created: " + name + " " + i);

            await sleep(delay);
        }

        bot.sendMessage(chatId,"🎉 All groups created successfully!");

    } catch (err) {

        console.log(err);

        bot.sendMessage(chatId,"❌ Error while creating groups");

    }

    delete userState[chatId];

}

});