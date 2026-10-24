-- Day 6: school database (SQLite)
-- Entities: students, courses, and enrolments (a student enrolled on a course, with a grade).

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ---------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------

CREATE TABLE students (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0)
);

CREATE TABLE enrolments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    course_id   INTEGER NOT NULL,
    grade       TEXT,  -- NULL until the student has been graded
    enrolled_on TEXT NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id)  REFERENCES courses(id),
    -- the same student cannot enrol on the same course twice
    UNIQUE (student_id, course_id)
);

-- ---------------------------------------------------------------
-- SAMPLE DATA
-- ---------------------------------------------------------------

INSERT INTO students (name, email) VALUES
    ('Amina Otieno',  'amina@example.com'),
    ('Brian Kamau',   'brian@example.com'),
    ('Cynthia Wanjiru', 'cynthia@example.com'),
    ('David Odhiambo', 'david@example.com');   -- will have no enrolments

INSERT INTO courses (title, credits) VALUES
    ('Web Foundations', 4),
    ('Databases',       3),
    ('Intro to AI',     3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 2, 'B'),
    (2, 1, 'B'),
    (2, 3, NULL),
    (3, 2, 'A');

COMMIT;

-- ---------------------------------------------------------------
-- QUERIES
-- ---------------------------------------------------------------

-- 1. All courses for one student (by name)
SELECT s.name AS student, c.title AS course, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amina Otieno';

-- 2. All students on one course
SELECT c.title AS course, s.name AS student, s.email
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Web Foundations';

-- 3. Number of students per course (LEFT JOIN so empty courses show 0)
SELECT c.title AS course, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title
ORDER BY student_count DESC;

-- 4. Students who have no enrolments
SELECT s.id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- 5. Update one enrolment's grade (Brian's Intro to AI enrolment gets a grade)
UPDATE enrolments
SET grade = 'A'
WHERE student_id = (SELECT id FROM students WHERE name = 'Brian Kamau')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Intro to AI');

-- Check the update worked
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Brian Kamau';