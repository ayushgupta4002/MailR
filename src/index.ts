import express, { Request, Response } from "express";
import { gmail_v1, google } from "googleapis";
import cron from "node-cron";
import OpenAI from "openai";
import { Queue } from "bullmq";
import { Worker } from "bullmq";

const myQueue = new Queue("processQueue", {
  connection: {
    host: "127.0.0.1",
    port: 6379,
  },
});

const worker = new Worker(
  "processQueue",
  async (job) => {
    // console.log("this is job : " + job.id);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const toEmail =job.data.emaildata.toEmail
    const from =job.data.emaildata.from
    const subject =job.data.emaildata.subject
    const messageId = job.data.emaildata.messageId
    const messageText =job.data.emaildata.messageText
    console.log("received item in queue" + from)

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: await createReplyRaw(
          toEmail,
          from,
          subject,
          messageId,
          messageText
        ),
      },
    }).then((resp)=>console.log("response is " + resp)).catch((err: any)=> console.log(err));

    console.log("Sending reply to " + from);

    const completion = await openai.chat.completions.create({
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
    const labelId = await createLabelIfNeeded(label || "Label");

    if (labelId) {
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: ["UNREAD"],
        },
      });
    }

    repliedMessages.add(messageId);
    console.log(job.id + " job completed")
  },
  {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
  }
);

const app = express();
const PORT = 5000;
require("dotenv").config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:5000/oauth2callback/google-callback";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

app.get("/auth", (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get(
  "/oauth2callback/google-callback",
  async (req: Request, res: Response) => {
    const code = req.query.code as string;
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const userInfo = await getUserInfo();
      res.send(
        `Authentication successful! You can close this tab. , Email: ${userInfo.email}`
      );
      cron.schedule("*/1 * * * *", () => {
        console.log("Checking emails and sending replies every 1 minute...");
        checkEmailsAndSendReplies();
      });
    } catch (error) {
      console.error("Error getting access token:", error);
      res.status(500).send("Error getting access token");
    }
  }
);

async function getUserInfo() {
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfoResponse = await oauth2.userinfo.get();
  return {
    id: userInfoResponse.data.id,
    email: userInfoResponse.data.email,
  };
}

async function listMessages(): Promise<gmail_v1.Schema$Message[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "-in:chat -from:me is:unread",
    maxResults: 2,
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
  return msg.data;
}

async function createLabelIfNeeded(labelName: string) {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;

  const existingLabel = labels?.find((label) => label.name === labelName);
  if (existingLabel) {
    return existingLabel.id;
  }

  const newLabel = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  return newLabel.data.id;
}

const repliedMessages = new Set<string>();

async function createReplyRaw(
  from: string,
  to: string,
  subject: string,
  messageId: string,
  messageText: string
) {
  let replyMessage;
  if (messageText) {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `${messageText} This is an email that I received, analyze this email content and write a brief and crisp reply to this email in excellent English with professionalism. Just return me the text and nothing else and do not include any tages like [your name] or [sender name] etc.The reply should completely in context of email and no extra preassumed text shall be added. If it has different lines, separate them. You can use this as an example: "Hi sir \nToday is nice\n\n"`,
        },
      ],
      model: "gpt-3.5-turbo",
    });
    replyMessage = completion.choices[0].message.content;
  } else {
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
        const from = email.payload?.headers?.find(
          (header) => header.name === "From"
        )?.value;
        const toEmail = email.payload?.headers?.find(
          (header) => header.name === "To"
        )?.value;
        const subject = email.payload?.headers?.find(
          (header) => header.name === "Subject"
        )?.value;
        const messageText = email.payload?.parts?.[0]?.body?.data;

        if (!from || !toEmail || !subject) {
          continue;
        }

        if (repliedMessages.has(message.id)) {
          continue;
        }
        if (!messageText) {
          continue;
        }

        const thread = await gmail.users.threads.get({
          userId: "me",
          id: message.threadId!,
        });

        const replies = thread.data.messages!.slice(1);

        if (replies.length === 0) {
          const emaildata = {
            toEmail: toEmail,
            from: from,
            subject : subject,
            messageText: messageText,
            messageId: message.id,
            gmail: gmail,
          };
          console.log("adding data to queue" + from)
          await myQueue.add("SendMessage", { emaildata: emaildata });
        }
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
      const messageText = emailDetails.payload?.parts?.[0]?.body?.data;

      const email = {
        id: emailDetails.id,
        sender: sender || "unknown sender",
        subject: subject || "No Subject",
        date: date || "",
        messageHTML: (messageHTML && decodeBase64(messageHTML)) || "No Message",
        messageText: (messageText && decodeBase64(messageText)) || "No Message",
      };

      return email;
    });

    const emails = (await Promise.all(emailPromises)).filter(
      (email) => email !== null
    );
    res.json(emails);
  } catch (error) {
    console.error("Error retrieving emails:", error);
    res.status(500).send("Error retrieving emails");
  }
});

function decodeBase64(encodedString: string): string | null {
  try {
    const buff = Buffer.from(encodedString, "base64");
    return buff.toString("utf-8");
  } catch (error) {
    console.error("Error decoding Base64:", error);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
