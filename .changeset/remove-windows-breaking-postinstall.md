---
"pgflow": patch
---

Remove the postinstall `chmod` script that broke `npm install pgflow` on Windows; npm sets the executable bit for `bin` files automatically.
