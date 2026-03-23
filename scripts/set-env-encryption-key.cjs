const fs = require("fs");
const [,, key, ...paths] = process.argv;
for (const path of paths) {
  let text = fs.readFileSync(path, "utf8");
  if (/^ENV_VAR_ENCRYPTION_KEY=/m.test(text)) {
    text = text.replace(/^ENV_VAR_ENCRYPTION_KEY=.*$/m, `ENV_VAR_ENCRYPTION_KEY="${key}"`);
  } else if (/^INBOUND_WEBHOOK_SHARED_SECRET=.*$/m.test(text)) {
    text = text.replace(/^INBOUND_WEBHOOK_SHARED_SECRET=.*$/m, (line) => `${line}\nENV_VAR_ENCRYPTION_KEY="${key}"`);
  } else {
    text += `\nENV_VAR_ENCRYPTION_KEY="${key}"\n`;
  }
  fs.writeFileSync(path, text);
}
