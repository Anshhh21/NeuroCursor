# 🧠 NeuroCursor

A dead-simple way to control your computer with your bare hands. Instead of dropping $3k on an Apple Vision Pro or dealing with a crusty mouse, you literally just point at the screen and it moves. It’s giving telekinesis. 

### Why this exists

Physical mice are lowkey outdated. Sometimes you're eating snacks, sometimes your trackpad is broken, or sometimes you just want to feel like Tony Stark. But setting up hand tracking usually means running janky scripts in the terminal, dealing with massive lag, or giving up your soul to the cloud. 

NeuroCursor gives you one clean app. Open it, turn on your camera, and you're controlling your Mac/PC like magic. 

No subscriptions. No cloud API keys. No data harvesting. Just a localized AI model doing the heavy lifting straight on your machine.

### What you get

* **Live map hero** — wait no, this isn't Pinbucket. You get a slick **React Dashboard**. Dark mode by default, lets you tweak smoothing, click delay, and scroll speed. It actually looks good.
* **Zero-latency tracking** — powered by Google's MediaPipe, it runs 100% locally at 30+ FPS. No lag, no weird jitter.
* **Pinch to click** — literally just tap your index finger and thumb together. Boom, left click. It's that easy.
* **Two-finger scroll** — raise two fingers and drag the air to doomscroll through whatever.
* **Open palm pause** — getting tired or need to scratch your nose? Show an open palm to freeze the cursor. Show it again to unfreeze. We love a boundary-setting app.
* **Cross-platform** — works on macOS (.dmg) and Windows (.exe) out of the box. 

### Running it locally

Want to run the dev environment? Bet. 

```bash
# install dependencies
npm install

# run the dev server (spawns the python engine + react UI)
npm run tauri dev
```
*Note: Make sure your Python virtual environment in `desktop/engine/.venv` is set up!*

### The Stack

**Tauri + React + Python (MediaPipe).** 
No bloated Electron apps. The UI is slick React/Tailwind, the heavy AI tracking is raw Python, and Tauri glues them together so it runs fast af and uses barely any RAM.