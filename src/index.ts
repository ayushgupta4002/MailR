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

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email", // Add user info scope
  "https://www.googleapis.com/auth/userinfo.profile" // Add profile info scope
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
  console.log(code);
  try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log(tokens);
      oauth2Client.setCredentials(tokens);
      const userInfo = await getUserInfo();
      console.log(userInfo); // Log user info to verify
      res.send(`Authentication successful! You can close this tab. User ID: ${userInfo.id}, Email: ${userInfo.email}`);
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

export async function listMessages(): Promise<gmail_v1.Schema$Message[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: 10,
  });
  return res.data.messages || [];
}

export async function getMessageDetails(
  messageId: string
): Promise<gmail_v1.Schema$Message> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
  });
  return msg.data;
}

app.get("/emails", async (req: Request, res: Response) => {
  try {
    const messages = await listMessages(); // Assuming listMessages() correctly fetches message IDs
    const emailPromises = messages?.map(async (message: any) => {
      const emailDetails = await getMessageDetails(message.id);
      let sender= "";
      let subject= "";
      let date = "";
      emailDetails.payload?.headers?.map(async (header) => {
        if (header.name === "From") {
            sender = header.value || sender; // Assign sender if header.value exists
        }
        if (header.name === "Subject") {
            subject = header.value || subject; // Assign subject if header.value exists
        }
        if (header.name === "Date") {
            date = header.value || date; // Assign date if header.value exists
        }
    });

      const messageHTML= emailDetails.payload?.parts?.[1]?.body?.data;
      const messageTEXT= emailDetails.payload?.parts?.[0]?.body?.data;

      const email = {
        id: emailDetails.id,
        sender : sender || "unknown sender",
        subject : subject || "No Subject",
        date : date || "",
        messageHTML : messageHTML && decodeBase64(messageHTML) || "No Message",
        messageTEXT : messageTEXT && decodeBase64(messageTEXT) || "No Message",
      }

      return email;
    });
    const emails = await Promise.all(emailPromises);
    res.json(emails);
  } catch (error) {
    console.error("Error retrieving emails:", error);
    res.status(500).send("Error retrieving emails");
  }
});

function decodeBase64(encodedString: string ): string | null {
    try {
        const buff = Buffer.from(encodedString, 'base64');
        return buff.toString('utf-8');
    } catch (error) {
        console.error('Error decoding Base64:', error);
        return null;
    }
}
// app.get('/webhook', async (req: Request, res: Response) => {
//   try {
//     const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
//     const response = await gmail.users.watch({
//       userId: 'me',
//       requestBody: {
//         topicName: 'projects/mailer-427505/topics/mailr_3241',
//         labelIds: ['INBOX'], // You can filter based on labels if needed
//         labelFilterBehavior: 'INCLUDE',
//       },
//     });
//     console.log('Watch response:', response.data);
//     res.status(200).send('Webhook set up successfully');
//   } catch (error) {
//     console.error('Error setting up webhook:', error);
//     res.status(500).send('Error setting up webhook');
//   }
// });
// app.post('/webhook', async (req: Request, res: Response) => {
//   const message = req.body;
//   console.log(message) // Extract message field from the request body
//   if (message && message.data) {
//     const data = Buffer.from(message.data, 'base64').toString('utf-8');
//     const notification = JSON.parse(data);
//     console.log('Received notification:', notification);

//     // Here you can handle the notification as needed, such as fetching updated messages

//     // Acknowledge the notification
//     res.status(200).send('Notification received');
//   } else {
//     console.error('Invalid notification received:', req.body);
//     res.status(400).send('Invalid notification format');
//   }
// })

// async function getHistory(sinceHistoryId: string) {
//   const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
//   const response = await gmail.users.history.list({
//     userId: 'me',
//     startHistoryId: sinceHistoryId,
//     historyTypes: ['messageAdded', 'messageDeleted']
//   });
//   console.log(response.data.history || []);
// }


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
