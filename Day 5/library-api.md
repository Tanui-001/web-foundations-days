# Library Books REST API

Base path: `/api`. All requests and responses use JSON.

## Endpoints

### 1. List books
- **Method:** GET
- **Path:** `/api/books`
- **Description:** Returns all books in the library.
- **Request body:** none

### 2. Get one book
- **Method:** GET
- **Path:** `/api/books/{id}`
- **Description:** Returns a single book by its id.
- **Request body:** none

### 3. Create a book
- **Method:** POST
- **Path:** `/api/books`
- **Description:** Adds a new book to the library.
### 4. Update a book (full replace)
- **Method:** PUT
- **Path:** `/api/books/{id}`
- **Description:** Replaces all the details of an existing book.

### 5. Update a book (partial)
- **Method:** PATCH
- **Path:** `/api/books/{id}`
- **Description:** Changes only the fields that are sent.
### 6. Delete a book
- **Method:** DELETE
- **Path:** `/api/books/{id}`
- **Description:** Removes a book from the library.
- **Request body:** none
### 7. List books by an author
- **Method:** GET
- **Path:** `/api/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the given author, using the `author` query parameter.
- **Request body:** none

## Error codes

### 400 Bad Request
- The request is invalid and the server cannot process it.
- **Example:** `POST /api/books` with a body that has no `title`, or with `year` sent as the text `"abc"` instead of a number.

### 404 Not Found
- The requested resource does not exist.
- **Example:** `GET /api/books/9999` when no book has the id 9999 (also applies to PUT, PATCH and DELETE on a missing id).