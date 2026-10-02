// ===== Notes Toolkit: Day 3 =====

let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// Lower-cases, trims and collapses repeated spaces so texts can be compared fairly.
function normalise(text) {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

// 1. Notes whose text contains the word (ignoring upper/lower case)
function searchNotes(word) {
  const target = String(word).toLowerCase();
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(target);
  });
}

// 2. The note with the most characters, or null when there are no notes
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count of notes per category, e.g. { personal: 2, work: 1, study: 2 }
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }

  // Put the keys in the order personal, work, study so the output is predictable
  const ordered = {};
  for (const category of VALID_CATEGORIES) {
    if (counts[category] !== undefined) {
      ordered[category] = counts[category];
    }
  }
  return ordered;
}

// 4. A sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const total = notes.length;
  const noteWord = total === 1 ? "note" : "notes";
  const counts = countByCategory();

  const parts = [];
  for (const category in counts) {
    parts.push(`${counts[category]} ${category}`);
  }

  if (parts.length === 0) {
    return `${total} ${noteWord}.`;
  }
  return `${total} ${noteWord}: ${parts.join(", ")}.`;
}

// 5. True if a note with the same text exists (ignoring case and extra spaces)
function isDuplicate(text) {
  const cleaned = normalise(text);
  return notes.some(function (note) {
    return normalise(note.text) === cleaned;
  });
}

// 6. Adds a note if valid. Returns true when added, false otherwise (and logs why).
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Not added: text must be a string.");
    return false;
  }

  const cleaned = text.trim().replace(/\s+/g, " ");

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: a note with the same text already exists.");
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  // Use the highest existing id + 1 so ids stay unique
  let maxId = 0;
  for (const note of notes) {
    if (note.id > maxId) {
      maxId = note.id;
    }
  }
  notes.push({ id: maxId + 1, text: cleaned, category: category });
  return true;
}

// ===== Tests =====
// Keep a copy of the original array so edge cases can temporarily swap it.
const originalNotes = notes;

console.log("--- searchNotes ---");
console.log(searchNotes("milk"));
// [ { id: 1, text: "Buy milk and bread", category: "personal" } ]
console.log(searchNotes("THE"));
// [ { id: 2, text: "Finish the Day 3 assignment", category: "study" },
//   { id: 3, text: "Email the project report to Grace", category: "work" } ]
console.log(searchNotes("zebra"));
// [] (no results)

console.log("--- longestNote ---");
console.log(longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }
notes = [];
console.log(longestNote());
// null (no notes)
notes = originalNotes;

console.log("--- countByCategory ---");
console.log(countByCategory());
// { personal: 2, work: 1, study: 2 }
notes = [];
console.log(countByCategory());
// {} (no notes)
notes = originalNotes;

console.log("--- getSummary ---");
console.log(getSummary());
// "5 notes: 2 personal, 1 work, 2 study."
notes = [originalNotes[0]];
console.log(getSummary());
// "1 note: 1 personal."
notes = [];
console.log(getSummary());
// "0 notes."
notes = originalNotes;

console.log("--- isDuplicate ---");
console.log(isDuplicate("  BUY   milk and BREAD "));
// true (same text ignoring case and extra spaces)
console.log(isDuplicate("Buy eggs"));
// false

console.log("--- addNote ---");
console.log(addNote("Pay electricity bill", "personal"));
// true (added as id 6)
console.log(addNote("buy milk and bread", "personal"));
// logs "Not added: a note with the same text already exists." then prints false
console.log(addNote("", "work"));
// logs "Not added: text must be 1-200 characters." then prints false
console.log(addNote("x".repeat(201), "work"));
// logs "Not added: text must be 1-200 characters." then prints false
console.log(addNote("Plan the sprint", "hobby"));
// logs "Not added: category must be personal, work or study." then prints false

console.log("--- after adding ---");
console.log(getSummary());
// "6 notes: 3 personal, 1 work, 2 study."