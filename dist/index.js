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
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
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
        res.send('Authentication successful! You can close this tab.');
    }
    catch (error) {
        console.error('Error getting access token:', error);
        res.status(500).send('Error getting access token');
    }
}));
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
        const emailPromises = messages.map((message) => __awaiter(void 0, void 0, void 0, function* () {
            const emailDetails = yield getMessageDetails(message.id); // Assuming getMessageDetails() correctly fetches message details
            return emailDetails;
        }));
        const emails = yield Promise.all(emailPromises);
        res.json(emails);
    }
    catch (error) {
        console.error("Error retrieving emails:", error);
        res.status(500).send("Error retrieving emails");
    }
}));
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
