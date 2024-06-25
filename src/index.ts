import express, { Request, Response } from "express";
import { gmail_v1, google } from "googleapis";
import cron from 'node-cron';

const app = express();
const PORT = 5000;
require('dotenv').config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth2callback/google-callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

app.get("/auth", (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback/google-callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const userInfo = await getUserInfo();
      res.send(`Authentication successful! You can close this tab. User ID: ${userInfo.id}, Email: ${userInfo.email}`);
      // cron.schedule('*/1 * * * *', () => {
      //   console.log('Checking emails and sending replies every 2 minutes...');
      //   checkEmailsAndSendReplies();
      // });
      

  } catch (error) {
    console.error('Error getting access token:', error);
    res.status(500).send('Error getting access token');
  }
});

async function getUserInfo() {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfoResponse = await oauth2.userinfo.get();
  return {
    id: userInfoResponse.data.id,
    email: userInfoResponse.data.email
  };
}












async function listMessages(): Promise<gmail_v1.Schema$Message[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 10,
  });
  return res.data.messages || [];
}

async function getMessageDetails(
  messageId: string
): Promise<gmail_v1.Schema$Message> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
  });
  console.log("message details are -- >",msg.data);

  return msg.data;
}




const repliedMessages = new Set<string>();

async function createReplyRaw(from: string, to: string, subject: string) {
  const emailContent = `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\nThank you for your message. I am unavailable right now, but will respond as soon as possible...`;
  const base64EncodedEmail = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return base64EncodedEmail;
}

async function checkEmailsAndSendReplies() {
  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const messages = await listMessages();
    console.log(messages);


    if (messages && messages.length > 0) {
      for (const message of messages) {
        if (!message.id) {
          continue;
        }

        const email = await getMessageDetails(message.id);
        const from = email.payload?.headers?.find((header) => header.name === "From")?.value;
        const toEmail = email.payload?.headers?.find((header) => header.name === "To")?.value;
        const subject = email.payload?.headers?.find((header) => header.name === "Subject")?.value;


        if (!from || !toEmail || !subject) {
          continue;
        }

        if (repliedMessages.has(message.id)) {
          continue;
        }

        const thread = await gmail.users.threads.get({
          userId: "me",
          id: message.threadId!,
        });

        const replies = thread.data.messages!.slice(1);

        if (replies.length === 0) {
          await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: await createReplyRaw(toEmail, from, subject),
            },
          });

        

          repliedMessages.add(message.id);        }
      }
    }
  } catch (error) {
    console.error("Error occurred:", error);
  }
}














app.get("/emails", async (req: Request, res: Response) => {
  try {
    const messages = await listMessages();
    const emailPromises = messages?.map(async (message) => {
      if (!message.id) {
        return null;
      }
      const emailDetails = await getMessageDetails(message.id);
      let sender = "";
      let subject = "";
      let date = "";

      emailDetails.payload?.headers?.forEach((header) => {
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

      const messageHTML = emailDetails.payload?.parts?.[1]?.body?.data;
      const messageTEXT = emailDetails.payload?.parts?.[0]?.body?.data;

      const email = {
        id: emailDetails.id,
        sender: sender || "unknown sender",
        subject: subject || "No Subject",
        date: date || "",
        messageHTML: messageHTML && decodeBase64(messageHTML) || "No Message",
        messageTEXT: messageTEXT && decodeBase64(messageTEXT) || "No Message",
      };

      return email;
    });

    const emails = (await Promise.all(emailPromises)).filter(email => email !== null);
    res.json(emails);
  } catch (error) {
    console.error("Error retrieving emails:", error);
    res.status(500).send("Error retrieving emails");
  }
});
function decodeBase64(encodedString: string): string | null {
  try {
    const buff = Buffer.from(encodedString, 'base64');
    return buff.toString('utf-8');
  } catch (error) {
    console.error('Error decoding Base64:', error);
    return null;
  }
}
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
