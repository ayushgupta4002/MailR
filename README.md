# MailR : Email Automation System

## Overview

This project provides an automated email processing system that integrates with Gmail and uses OpenAI's GPT-3.5-turbo model to analyze and respond to emails. It uses Express for the server, Google APIs for Gmail interactions, node-cron for scheduling tasks, and BullMQ for job queue management.

## Features

1. **OAuth2 Authentication**: Allows users to authenticate via Google OAuth2.
2. **Email Fetching**: Retrieves unread emails from Gmail.
3. **Email Replying**: Automatically replies to emails based on their content.
4. **Email Labeling**: Labels emails based on content analysis.
5. **Scheduling**: Checks and processes emails at regular intervals.
6. **Queue Management**: Uses BullMQ for handling email processing tasks asynchronously.

## Prerequisites

- Node.js
- Typescript
- npm or yarn
- Redis server(for BullMQ)

## Setup

1. **Clone the repository**:
    ```sh
    git clone https://github.com/your-repo/email-automation-system.git
    cd email-automation-system
    ```

2. **Install dependencies**:
    ```sh
    npm install
    ```

3. **Create a `.env` file** in the root directory and add the following environment variables:
    ```
    CLIENT_ID=<your-google-client-id>
    CLIENT_SECRET=<your-google-client-secret>
    OPENAI_API_KEY=<your-openai-api-key>
    ```

4. **Start Redis server** (if not already running):
    ```sh
    docker run -it -p 6379:6379 -d redis
    ```

## Running the Application

1. **Start the Express server**:
    ```sh
    npm run dev 
    ```

2. **Authenticate with Google**:
    - Open a browser and go to `http://localhost:5000/auth`.
    - Complete the authentication process and allow access to your Gmail account.

## API Endpoints

### 1. **GET `/auth`**

Initiates the Google OAuth2 authentication process. Redirects the user to the Google login page.

### 2. **GET `/oauth2callback/google-callback`** [This is a redirect route,You Don't need to visit this route manually]

Callback endpoint for Google OAuth2. Handles the OAuth2 response, stores the tokens, and starts the cron job for checking emails.

### 3. **GET `/emails`**

Fetches and returns a list of unread emails from the authenticated Gmail account.

## Functions

### `getUserInfo()`

Retrieves the authenticated user's information (email and id) from Google.

### `listMessages()`

Lists unread messages from the user's Gmail account.

### `getMessageDetails(messageId: string)`

Gets detailed information about a specific message.

### `createLabelIfNeeded(labelName: string)`

Creates a new Gmail label if it doesn't already exist.

### `createReplyRaw(from: string, to: string, subject: string, messageId: string, messageText: string)`

Generates a base64-encoded email reply.

### `checkEmailsAndSendReplies()`

Checks for unread emails and processes them by adding tasks to the BullMQ queue.

## BullMQ Worker

Processes jobs added to the `processQueue`. Each job involves sending a reply to an email and labeling it based on content analysis using OpenAI's GPT-3.5-turbo model.


## Usage Example

1. **Start the application**:
    ```sh
    npm run dev
    ```

2. **Authenticate with Google** by visiting `http://localhost:5000/auth`.

3. **Check emails** by visiting `http://localhost:5000/emails`.

4. **Wait for cron job** to automatically check and process emails every minute.

## Conclusion

This project provides a robust system for automating email responses and labeling using AI. It integrates seamlessly with Gmail and leverages the power of OpenAI's GPT-3.5-turbo model to understand and respond to email content professionally.
