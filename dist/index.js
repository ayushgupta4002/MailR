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
exports.listMessages = listMessages;
exports.getMessageDetails = getMessageDetails;
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
    "https://www.googleapis.com/auth/userinfo.email", // Add user info scope
    "https://www.googleapis.com/auth/userinfo.profile" // Add profile info scope
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
    console.log(code);
    try {
        const { tokens } = yield oauth2Client.getToken(code);
        console.log(tokens);
        oauth2Client.setCredentials(tokens);
        const userInfo = yield getUserInfo();
        console.log(userInfo); // Log user info to verify
        res.send(`Authentication successful! You can close this tab. User ID: ${userInfo.id}, Email: ${userInfo.email}`);
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
        return msg.data;
    });
}
app.get("/emails", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const messages = yield listMessages(); // Assuming listMessages() correctly fetches message IDs
        const emailPromises = messages === null || messages === void 0 ? void 0 : messages.map((message) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const emailDetails = yield getMessageDetails(message.id);
            let sender = "";
            let subject = "";
            let date = "";
            (_b = (_a = emailDetails.payload) === null || _a === void 0 ? void 0 : _a.headers) === null || _b === void 0 ? void 0 : _b.map((header) => __awaiter(void 0, void 0, void 0, function* () {
                if (header.name === "From") {
                    sender = header.value || sender; // Assign sender if header.value exists
                }
                if (header.name === "Subject") {
                    subject = header.value || subject; // Assign subject if header.value exists
                }
                if (header.name === "Date") {
                    date = header.value || date; // Assign date if header.value exists
                }
            }));
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
        const emails = yield Promise.all(emailPromises);
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
app.get('/webhook', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2Client });
        const response = yield gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: 'projects/mailer-427505/topics/mailr_3241',
                labelIds: ['INBOX'], // You can filter based on labels if needed
                labelFilterBehavior: 'INCLUDE',
            },
        });
        console.log('Watch response:', response.data);
        res.status(200).send('Webhook set up successfully');
    }
    catch (error) {
        console.error('Error setting up webhook:', error);
        res.status(500).send('Error setting up webhook');
    }
}));
app.post('/webhook', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const message = req.body;
    console.log(message); // Extract message field from the request body
    if (message && message.data) {
        const data = Buffer.from(message.data, 'base64').toString('utf-8');
        const notification = JSON.parse(data);
        console.log('Received notification:', notification);
        // Here you can handle the notification as needed, such as fetching updated messages
        // Acknowledge the notification
        res.status(200).send('Notification received');
    }
    else {
        console.error('Invalid notification received:', req.body);
        res.status(400).send('Invalid notification format');
    }
}));
function getHistory(sinceHistoryId) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauth2Client });
        const response = yield gmail.users.history.list({
            userId: 'me',
            startHistoryId: sinceHistoryId,
            historyTypes: ['messageAdded', 'messageDeleted']
        });
        console.log(response.data.history || []);
    });
}
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
