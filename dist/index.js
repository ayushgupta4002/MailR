"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const googleapis_1 = require("googleapis");
const app = (0, express_1.default)();
const PORT = 5000;
require('dotenv').config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth2callback/google-callback";
const oauth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
];
app.get("/auth", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
    });
    res.redirect(authUrl);
});
app.get('/oauth2callback/google-callback', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const code = req.query.code;
    try {
        const { tokens } = yield oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const userInfo = yield getUserInfo();
        res.send(`Authentication successful! You can close this tab. User ID: ${userInfo.id}, Email: ${userInfo.email}`);
        // cron.schedule('*/1 * * * *', () => {
        //   console.log('Checking emails and sending replies every 2 minutes...');
        //   checkEmailsAndSendReplies();
        // });
    }
    catch (error) {
        console.error('Error getting access token:', error);
        res.status(500).send('Error getting access token');
    }
}));
function getUserInfo() {
    return __awaiter(this, void 0, void 0, function* () {
        const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfoResponse = yield oauth2.userinfo.get();
        return {
            id: userInfoResponse.data.id,
            email: userInfoResponse.data.email
        };
    });
}
function listMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
        const res = yield gmail.users.messages.list({
            userId: "me",
            q: "is:unread",
            maxResults: 10,
        });
        return res.data.messages || [];
    });
}
function getMessageDetails(messageId) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
        const msg = yield gmail.users.messages.get({
            userId: "me",
            id: messageId,
        });
        console.log("message details are -- >", msg.data);
        return msg.data;
    });
}
const repliedMessages = new Set();
function createReplyRaw(from, to, subject) {
    return __awaiter(this, void 0, void 0, function* () {
        const emailContent = `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\nThank you for your message. I am unavailable right now, but will respond as soon as possible...`;
        const base64EncodedEmail = Buffer.from(emailContent)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        return base64EncodedEmail;
    });
}
function checkEmailsAndSendReplies() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
            const messages = yield listMessages();
            console.log(messages);
            if (messages && messages.length > 0) {
                for (const message of messages) {
                    if (!message.id) {
                        continue;
                    }
                    const email = yield getMessageDetails(message.id);
                    const from = (_c = (_b = (_a = email.payload) === null || _a === void 0 ? void 0 : _a.headers) === null || _b === void 0 ? void 0 : _b.find((header) => header.name === "From")) === null || _c === void 0 ? void 0 : _c.value;
                    const toEmail = (_f = (_e = (_d = email.payload) === null || _d === void 0 ? void 0 : _d.headers) === null || _e === void 0 ? void 0 : _e.find((header) => header.name === "To")) === null || _f === void 0 ? void 0 : _f.value;
                    const subject = (_j = (_h = (_g = email.payload) === null || _g === void 0 ? void 0 : _g.headers) === null || _h === void 0 ? void 0 : _h.find((header) => header.name === "Subject")) === null || _j === void 0 ? void 0 : _j.value;
                    if (!from || !toEmail || !subject) {
                        continue;
                    }
                    if (repliedMessages.has(message.id)) {
                        continue;
                    }
                    const thread = yield gmail.users.threads.get({
                        userId: "me",
                        id: message.threadId,
                    });
                    const replies = thread.data.messages.slice(1);
                    if (replies.length === 0) {
                        yield gmail.users.messages.send({
                            userId: "me",
                            requestBody: {
                                raw: yield createReplyRaw(toEmail, from, subject),
                            },
                        });
                        repliedMessages.add(message.id);
                    }
                }
            }
        }
        catch (error) {
            console.error("Error occurred:", error);
        }
    });
}
app.get("/emails", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const messages = yield listMessages();
        const emailPromises = messages === null || messages === void 0 ? void 0 : messages.map((message) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            if (!message.id) {
                return null;
            }
            const emailDetails = yield getMessageDetails(message.id);
            let sender = "";
            let subject = "";
            let date = "";
            (_b = (_a = emailDetails.payload) === null || _a === void 0 ? void 0 : _a.headers) === null || _b === void 0 ? void 0 : _b.forEach((header) => {
                if (header.name === "From") {
                    sender = header.value || sender;
                }
                if (header.name === "Subject") {
                    subject = header.value || subject;
                }
                if (header.name === "Date") {
                    date = header.value || date;
                }
            });
            const messageHTML = (_f = (_e = (_d = (_c = emailDetails.payload) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[1]) === null || _e === void 0 ? void 0 : _e.body) === null || _f === void 0 ? void 0 : _f.data;
            const messageTEXT = (_k = (_j = (_h = (_g = emailDetails.payload) === null || _g === void 0 ? void 0 : _g.parts) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.body) === null || _k === void 0 ? void 0 : _k.data;
            const email = {
                id: emailDetails.id,
                sender: sender || "unknown sender",
                subject: subject || "No Subject",
                date: date || "",
                messageHTML: messageHTML && decodeBase64(messageHTML) || "No Message",
                messageTEXT: messageTEXT && decodeBase64(messageTEXT) || "No Message",
            };
            return email;
        }));
        const emails = (yield Promise.all(emailPromises)).filter(email => email !== null);
        res.json(emails);
    }
    catch (error) {
        console.error("Error retrieving emails:", error);
        res.status(500).send("Error retrieving emails");
    }
}));
function decodeBase64(encodedString) {
    try {
        const buff = Buffer.from(encodedString, 'base64');
        return buff.toString('utf-8');
    }
    catch (error) {
        console.error('Error decoding Base64:', error);
        return null;
    }
}
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
