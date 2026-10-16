const USERS_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

// Stores the loaded users so filtering never needs a new request.
let allUsers = [];

async function loadUsers() {
  statusEl.textContent = "Loading users...";
  loadButton.disabled = true;

  try {
    const response = await fetch(USERS_URL);
    if (!response.ok) {
      throw new Error("Request failed with status " + response.status);
    }
    allUsers = await response.json();
    renderUsers(filterUsers());
    statusEl.textContent = "Loaded " + allUsers.length + " users.";
  } catch (error) {
    statusEl.textContent = "Error: could not load users. " + error.message;
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(list) {
  usersList.textContent = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.appendChild(li);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("div");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("div");
    company.textContent = "Company: " + user.company.name;

    li.append(name, email, city, company);
    usersList.appendChild(li);
  });
}

function filterUsers() {
  const text = filterInput.value.trim().toLowerCase();
  return allUsers.filter((user) => user.name.toLowerCase().includes(text));
}

loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  if (allUsers.length === 0) return; // nothing loaded yet
  renderUsers(filterUsers());
});