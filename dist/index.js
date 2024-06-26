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
const node_cron_1 = __importDefault(require("node-cron"));
const openai_1 = __importDefault(require("openai"));
const bullmq_1 = require("bullmq");
const bullmq_2 = require("bullmq");
const myQueue = new bullmq_1.Queue("processQueue", {
    connection: {
        host: "127.0.0.1",
        port: 6379,
    },
});
const worker = new bullmq_2.Worker("processQueue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    // console.log("this is job : " + job.id);
    const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
    const toEmail = job.data.emaildata.toEmail;
    const from = job.data.emaildata.from;
    const subject = job.data.emaildata.subject;
    const messageId = job.data.emaildata.messageId;
    const messageText = job.data.emaildata.messageText;
    console.log("received item in queue" + from);
    yield gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: yield createReplyRaw(toEmail, from, subject, messageId, messageText),
        },
    }).then((resp) => console.log("response is " + resp)).catch((err) => console.log(err));
    console.log("Sending reply to " + from);
    const completion = yield openai.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `${messageText} This is an email that I received, analyze this email content and assign a label to it out of these 3: {Interested, Not Interested, More Information}. Return only one of these as a reply and nothing other than this.`,
            },
        ],
        model: "gpt-3.5-turbo",
    });
    console.log(completion.choices[0].message.content);
    const label = completion.choices[0].message.content;
    const labelId = yield createLabelIfNeeded(label || "Label");
    if (labelId) {
        yield gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ["UNREAD"],
            },
        });
    }
    repliedMessages.add(messageId);
    console.log(job.id + " job completed");
}), {
    connection: {
        host: "127.0.0.1",
        port: 6379,
    },
});
const app = (0, express_1.default)();
const PORT = 5000;
require("dotenv").config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth2callback/google-callback";
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const oauth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];
app.get("/auth", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
    });
    res.redirect(authUrl);
});
app.get("/oauth2callback/google-callback", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const code = req.query.code;
    try {
        const { tokens } = yield oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const userInfo = yield getUserInfo();
        res.send(`Authentication successful! You can close this tab. , Email: ${userInfo.email}`);
        node_cron_1.default.schedule("*/1 * * * *", () => {
            console.log("Checking emails and sending replies every 1 minute...");
            checkEmailsAndSendReplies();
        });
    }
    catch (error) {
        console.error("Error getting access token:", error);
        res.status(500).send("Error getting access token");
    }
}));
function getUserInfo() {
    return __awaiter(this, void 0, void 0, function* () {
        const oauth2 = googleapis_1.google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfoResponse = yield oauth2.userinfo.get();
        return {
            id: userInfoResponse.data.id,
            email: userInfoResponse.data.email,
        };
    });
}
function listMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
        const res = yield gmail.users.messages.list({
            userId: "me",
            q: "-in:chat -from:me is:unread",
            maxResults: 2,
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
        return msg.data;
    });
}
function createLabelIfNeeded(labelName) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
        const res = yield gmail.users.labels.list({ userId: "me" });
        const labels = res.data.labels;
        const existingLabel = labels === null || labels === void 0 ? void 0 : labels.find((label) => label.name === labelName);
        if (existingLabel) {
            return existingLabel.id;
        }
        const newLabel = yield gmail.users.labels.create({
            userId: "me",
            requestBody: {
                name: labelName,
                labelListVisibility: "labelShow",
                messageListVisibility: "show",
            },
        });
        return newLabel.data.id;
    });
}
const repliedMessages = new Set();
function createReplyRaw(from, to, subject, messageId, messageText) {
    return __awaiter(this, void 0, void 0, function* () {
        let replyMessage;
        if (messageText) {
            const completion = yield openai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${messageText} This is an email that I received, analyze this email content and write a brief and crisp reply to this email in excellent English with professionalism. Just return me the text and nothing else and do not include any tages like [your name] or [sender name] etc.The reply should completely in context of email and no extra preassumed text shall be added. If it has different lines, separate them. You can use this as an example: "Hi sir \nToday is nice\n\n"`,
                    },
                ],
                model: "gpt-3.5-turbo",
            });
            replyMessage = completion.choices[0].message.content;
        }
        else {
            replyMessage =
                "Thank you for your message. I am unavailable right now, but will respond as soon as possible...";
        }
        console.log(replyMessage);
        const emailContent = `From: ${from}\nTo: ${to}\nSubject: Re: ${subject}\nIn-Reply-To: ${messageId}\nReferences: ${messageId}\n\n${replyMessage}`;
        const base64EncodedEmail = Buffer.from(emailContent)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        return base64EncodedEmail;
    });
}
function checkEmailsAndSendReplies() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
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
                    const messageText = (_o = (_m = (_l = (_k = email.payload) === null || _k === void 0 ? void 0 : _k.parts) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.body) === null || _o === void 0 ? void 0 : _o.data;
                    if (!from || !toEmail || !subject) {
                        continue;
                    }
                    if (repliedMessages.has(message.id)) {
                        continue;
                    }
                    if (!messageText) {
                        continue;
                    }
                    const thread = yield gmail.users.threads.get({
                        userId: "me",
                        id: message.threadId,
                    });
                    const replies = thread.data.messages.slice(1);
                    if (replies.length === 0) {
                        const emaildata = {
                            toEmail: toEmail,
                            from: from,
                            subject: subject,
                            messageText: messageText,
                            messageId: message.id,
                            gmail: gmail,
                        };
                        console.log("adding data to queue" + from);
                        yield myQueue.add("SendMessage", { emaildata: emaildata });
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
            const messageText = (_k = (_j = (_h = (_g = emailDetails.payload) === null || _g === void 0 ? void 0 : _g.parts) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.body) === null || _k === void 0 ? void 0 : _k.data;
            const email = {
                id: emailDetails.id,
                sender: sender || "unknown sender",
                subject: subject || "No Subject",
                date: date || "",
                messageHTML: (messageHTML && decodeBase64(messageHTML)) || "No Message",
                messageText: (messageText && decodeBase64(messageText)) || "No Message",
            };
            return email;
        }));
        const emails = (yield Promise.all(emailPromises)).filter((email) => email !== null);
        res.json(emails);
    }
    catch (error) {
        console.error("Error retrieving emails:", error);
        res.status(500).send("Error retrieving emails");
    }
}));
function decodeBase64(encodedString) {
    try {
        const buff = Buffer.from(encodedString, "base64");
        return buff.toString("utf-8");
    }
    catch (error) {
        console.error("Error decoding Base64:", error);
        return null;
    }
}
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
