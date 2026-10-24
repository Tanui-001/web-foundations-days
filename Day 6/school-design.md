# School database design

## Tables

**students** – one row per person who studies at the school. Columns: `id` (primary key), `name` (required) and `email` (required and `UNIQUE`, so two students cannot share an address and it can identify a student).

**courses** – one row per course offered. Columns: `id` (primary key), `title` and `credits` (both required; credits must be above zero).

**enrolments** – one row per "this student is on this course". Columns: `id` (primary key), `student_id` and `course_id` (foreign keys to `students` and `courses`, both required), `grade` (nullable, because a new enrolment has not been graded yet) and `enrolled_on` (defaults to today). A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **students → enrolments is one-to-many**: one student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses → enrolments is one-to-many**: one course can have many enrolments, but each enrolment belongs to exactly one course.
- **students ↔ courses is many-to-many**: a student takes many courses and a course has many students. It is made up of the two one-to-many links above.

A relational table cannot hold a list of values in a single column, so there is no clean way to put "many courses" inside a student row or "many students" inside a course row. A **join table** (`enrolments`) solves this by storing one row per pairing. It is also the natural home for data that belongs to the *pairing* rather than to either side, such as the grade and the enrolment date: a grade is not a property of the student alone or of the course alone, only of that student on that course.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The `UNIQUE (student_id, course_id)` rule already creates an index that speeds up searches by student. Searches by course alone ("all students on this course", "students per course") cannot use that index efficiently, because `course_id` is its second column. Without a separate index, SQLite would scan the whole enrolments table as it grows.

## SQL or NoSQL?

I would choose SQL (a relational database) for this system. The data is clearly structured and relational: students, courses and enrolments have fixed fields and well-defined links between them. A relational database can enforce the rules that matter here directly: foreign keys stop an enrolment pointing at a student or course that does not exist, `UNIQUE` stops duplicate emails and double enrolments, and transactions keep updates consistent. Questions like "students per course" or "students with no enrolments" are also natural with `JOIN` and `GROUP BY`. NoSQL would make more sense if the data were unstructured or changed shape constantly, or if we needed to scale writes across many servers, but a school's records are small, structured and need integrity more than they need extreme scale.