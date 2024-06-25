import express, { Request, Response } from "express";
import { gmail_v1, google } from "googleapis";

const app = express();
const PORT = 5000;
require('dotenv').config();
const CLIENT_ID =process.env.CLIENT_ID;
const CLIENT_SECRET =process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth2callback/google-callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

app.get("/auth", (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback/google-callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    console.log(code);
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log(tokens)
        oauth2Client.setCredentials(tokens);
      res.send('Authentication successful! You can close this tab.');
    } catch (error) {
      console.error('Error getting access token:', error);
      res.status(500).send('Error getting access token');
    }
  });


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
