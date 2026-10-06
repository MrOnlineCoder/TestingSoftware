Implement an automated testing software for use in educational environments.

## Tech Stack

- Node.js
- Fastify
- Typescript
- Drizzle.ORM
- SQLite as ORM backend (better-sqlite)
- Vue.js 3 + Pinia for frontend
- PrimeVue for UI
- fetch API for HTTP requests

For backend, follow guidelines outlined in https://raw.githubusercontent.com/MrOnlineCoder/SeamlessNodejsTemplate/refs/heads/master/README.md

## General description

1. App is fully local and does not require authentication, RBAC or similar. Instead, there are just two modes user can open UI - teacher or student. Teacher mode requires a password to access, set in .env file.
2. Teacher mode allows creating, editing, and deleting tests, while student mode only allows taking tests.
3. Tests are packed into **"testsuites" or "collections"**, which group multiple related tests together for easier management and execution.
4. Each collection can contain multiple **tests**, each test contains one question.
5. There are following types of questions: single choice, multiple choice, single number, free text.
6. Each question/test has a prompt (markdown editable), score (1 by default).
7. Each test has a correct answer defined, which is used for automatic grading in student mode.
8. After adding at least 1 test question to the collection, a **test/exam session** can be started for given collection. To start, teacher enters into form the following fields: student name, student ID (optional), flag if questions can be returned to/skipped, flag if student immediately sees the correct answer, flag if student sees their final score, time limit (in minutes, optional).
9. Any amount of test/exam sessions can be started for a given collection, and each session is independent of others. Collection is not editable unless there are no active sessions.
10. Exam session is opened in separate URL, like `/exam/{id}`. It can be opened on same machine, or shared to other devices for students to take the exam in local network.
11. After the exam session is completed, the teacher can view the results, including the student's answers, scores, and overall performance.

## Bonus feature

This is optional and may require separate research. I want teacher to be able to take the exam questions in offline manner:
1. After adding all questions, they can create an "offline exam session" by printing two auto-generated documents: 
   - One document contains the questions for students to answer, regular word/markdown like list of questions with their answers.
   - The other document is the answers blank, where students can fill in their response.
2. The blank is intended for automatic OCR checking of answers - students fill their responses with contrasting black marker, in exact spots in specific manner (for example, filling a circle). Then, the result is scanned, loaded into app and all answers are automatically checked against the correct answers.
3. After doing the exam offline, blank is collected by teacher, scanned and uploaded as image to the app. The app should OCR/identify the answers, show the detected answers for manual revision by teacher, and then, if confirmed, an exam session is created with these answers right away, with the final score.

## Frontend layout

General: top bar with navigation links and mode switcher (teacher/student)

For each page, use simple primevue components like table, form, button, and dialog.

### Teacher mode
- Testsuites list. Table of test suites (title, creation date, questions count), button to create new test suite, button to delete a test suite.
- Test suite details. List of tests/questions in a Google Forms manner (inline editing), with buttons to add, edit, and delete questions.
- Exam sessions. Table of all exam sessions (columns test suite, student name, student id, score, status). 
- Exam session details. Show all questions in the session along with student's answers, correct answers, and scores for each question.
- Offline exam session creation. Just a popup that allows downloading the question and answer blank documents.
- Offline exam session submission. Provide a way for teachers to upload the scanned answer blanks, perform OCR to detect student responses, allow manual revision, and then finalize the exam session with scores.

## Student mode
- Topbar only includes student name, and timer button. Contains timer if it's configured.
- Start page. Only after clicking "Start" the actual exam session starts - done only when student is ready.
- One page that displays one question per time with navigation buttons to move to the next or previous question (if allowed) and options to select or input the answer.
- Submit page. After completing all questions, students can review their answers and submit the exam session.
- Results page. Show score (if allowed), along with correct answers and explanations (if allowed).
- Going to already closed exam session shows the results page with the final score, correct answers, and explanations (if allowed).

## General guidelines
- Keep UI simple, this is MVP/prototype only
- No need to keep track of students as separate table
- No need for unit or e2e tests