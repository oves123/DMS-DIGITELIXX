const fetch = require("node-fetch");
Promise.all([
  fetch("https://dms-digitelixx.login-157.workers.dev/api/products").then(r=>r.status),
  fetch("https://dms-digitelixx.login-157.workers.dev/api/orders").then(r=>r.status),
  fetch("https://dms-digitelixx.login-157.workers.dev/api/inventory").then(r=>r.status),
  fetch("https://dms-digitelixx.login-157.workers.dev/api/distributors").then(r=>r.status)
]).then(console.log);
