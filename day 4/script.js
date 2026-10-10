const MAX_CHARS = 200;
const WARN_AT = 180;
const DRAFT_KEY = "draft";
const THEME_KEY = "theme";

const textarea = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeBtn = document.getElementById("theme-toggle");

function updateCounts() {
  const text = textarea.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = chars + " / " + MAX_CHARS + " characters";
  wordCount.textContent = words + (words === 1 ? " word" : " words");

  charCount.classList.toggle("warning", chars > WARN_AT && chars <= MAX_CHARS);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, textarea.value);
  } catch (e) {
    console.error("Could not save draft:", e);
  }
}

function clearAll() {
  textarea.value = "";
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.error("Could not remove draft:", e);
  }
  updateCounts();
  textarea.focus();
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeBtn.textContent = isDark ? "Light mode" : "Dark mode";
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  try {
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  } catch (e) {
    console.error("Could not save theme:", e);
  }
}

// Events
textarea.addEventListener("input", function () {
  updateCounts();
  saveDraft();
});

textarea.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

clearBtn.addEventListener("click", clearAll);
themeBtn.addEventListener("click", toggleTheme);

// On load: restore draft and theme, then update counters
try {
  const savedDraft = localStorage.getItem(DRAFT_KEY);
  if (savedDraft !== null) {
    textarea.value = savedDraft;
  }
  applyTheme(localStorage.getItem(THEME_KEY) === "dark");
} catch (e) {
  console.error("Could not restore saved state:", e);
}
updateCounts();