# Quizbee

Quizbee turns YouTube videos into interactive assignments for Google Classroom. Teachers select a class, choose a video, add timestamped multiple-choice questions and publish an assignment with an optional due date. Students answer the questions as the video plays and turn in their own Classroom submission. Scores appear in the assigning teacher's Quizbee dashboard.

## What you need

- Node.js 26.x and a Vercel project (the repository selects Node 26 for Vercel).
- The Firebase project `quizbee-5b558`, with Google sign-in enabled in **Authentication → Sign-in method**, and a Cloud Firestore database created.
- The **Google Classroom API** and **YouTube Data API v3** enabled in that same Google Cloud project.
- An OAuth consent screen configured for the audience that will use the app. In testing mode, add all teachers and students as test users; Workspace administrators may also need to allow the app and Classroom scopes. Google may require verification before broader use. Students must already be enrolled in the Classroom; teachers must be teachers in the selected class.
- A YouTube Data API key, restricted to that API. This is a separate **server-only** key from the Firebase web API key.
- A Firebase service account for the same project with Firestore read/write access (for example, the Cloud Datastore User IAM role). Keep its JSON private.

The Firebase web app's non-secret project identifiers are filled in `.env.example`. Copy the web API key from the Firebase configuration supplied for this project into `NEXT_PUBLIC_FIREBASE_API_KEY`; do not commit local environment files. Firebase web API keys are exposed to browsers by design: restrict the key to the APIs and application origins required by Firebase Authentication, and follow [Firebase's API key guidance](https://firebase.google.com/docs/projects/api-keys). Do not use the Firebase key as a substitute for the separately configured YouTube server key.

## Configure and deploy

1. In Firebase Authentication settings, add `localhost` and your Vercel production hostname to **Authorized domains**. Configure the Google OAuth consent screen and, if required by your OAuth client, add the production and local origins there too.
2. Create the Firestore database. `firestore.rules` denies all direct client access; the app accesses Firestore only through its authenticated server. Review the rules before deploying them: deploying them replaces existing rules and can affect other apps sharing this database. For a database dedicated to Quizbee, deploy with:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project quizbee-5b558
   ```

3. Import this repository into Vercel. Add every variable from `.env.example` to the Vercel project:
   - The `NEXT_PUBLIC_FIREBASE_*` values are the Firebase web configuration. Add the provided Firebase web API key as described above.
   - `YOUTUBE_API_KEY` is the server-only YouTube key.
   - `FIREBASE_SERVICE_ACCOUNT_JSON` is the **entire JSON object** from the service-account key, entered as one environment-variable value. Never use a `NEXT_PUBLIC_` prefix for it.
   - `APP_URL` is the stable production origin, for example `https://your-app.vercel.app`, without a trailing slash. Published Classroom assignments link to this origin, so do not use a temporary preview URL.
4. Deploy or redeploy after setting the variables. Public Firebase variables are included in the client build, so changing them requires a redeploy. Add any custom production domain to Firebase's authorized domains and update `APP_URL` before assigning work.
5. Sign in as a teacher, allow the Classroom permissions, create a Quizbee, and assign it to an active class. Sign in as an enrolled student in a separate browser session and open the Classroom assignment.

For local development, copy `.env.example` to `.env.local`, fill in the missing values, set `APP_URL=http://localhost:3000`, then run:

```sh
npm ci
npm run dev
```

In Firebase Authentication, the Firebase web client and the OAuth client issuing Classroom access tokens must belong to the same Google Cloud project that creates the coursework. Google only allows the assigned student to turn in their submission, and requires the OAuth project performing turn-in to match the project that created the Classroom work.

## How it works

- Teachers grant `classroom.courses.readonly` and `classroom.coursework.students`. Students grant `classroom.courses.readonly` and `classroom.coursework.me`. Users can switch roles, which asks Google for the appropriate permissions. Tokens are held in the current browser tab and sent to the server for Google requests, not stored in Firestore. Google access tokens expire; use **Reconnect Google** if prompted.
- The server verifies both the Firebase sign-in and that the Google access token belongs to the same Google account. It checks Classroom membership before returning a student's assignment or creating a teacher's quiz or assignment.
- Quiz definitions and immutable assignment snapshots, including answer keys, are stored in Firestore. The student API never returns answer keys. The server calculates the score, records it, and turns in the student's own Classroom submission. The teacher sees scores in Quizbee; scores are **not** automatically posted to the Classroom gradebook.
- Students see open Quizbee assignments for their active classes, not unrelated Classroom assignments. A returned or already turned-in assignment is not shown as open. Students must watch the video through and answer all questions before the Turn in button is enabled. Rewind returns to 30 seconds before the question and asks it again.
- If an assignment post is unconfirmed, use **Check Classroom** on the outgoing card before posting again. If a student's turn-in succeeds but the connection fails before Quizbee confirms the score, reopening the original assignment link reconciles the recorded score.
- YouTube videos can become private, unavailable, age-restricted, or unembeddable after selection, and school network or account policies may block playback. YouTube search consumes API quota. If a video fails, the teacher must assign a new Quizbee using an available video.

This is a basic learning app, not an exam-proctoring system: a browser cannot prevent a determined user from inspecting or manipulating their own playback and answers. Before using it with children or student records, configure your organization's Google Workspace, privacy, retention, consent, and applicable education-data requirements. Firestore results remain stored until an administrator deletes them.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The tests mock Google and Firestore; a real deployment still requires the Firebase, Classroom, YouTube, OAuth, and Workspace configuration above.
