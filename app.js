const CONTENT = {
  couple: ["เติ้ล", "เฟิร์น"],
  anniversaryDate: "29 กันยายน 2569",
  duration: "6 ปี 2 เดือน",
  music: "romantic-song.mp3",
  surpriseVideo: "surprise-video.mp4",
  personalLetter: {
    intro: "ถึงเฟิร์น . . .",
    paragraphs: [
      "นี่เติ้ลเองนะ",
      "พอเฟิร์นได้ดูมาถึงตรงนี้แล้ว\nเค้าอยากจะบอกเธออย่างนึงว่า",
      "ที่ผ่านมานี้เค้ามีความสุขมากๆเลยนะ",
      "ถ้าเกิดย้อนเวลากลับไปได้\nเค้าก็จะทักหาเธอเหมือนเดิม\nจะจีบเธอเหมือนเดิม",
      "และก็จะทำให้ทุกๆวินาที\nที่เค้าได้อยู่กับเธอ\nให้ดีกว่าเดิม ❤️"
    ],
    signature: "— เติ้ล"
  },
  memoryPhotos: ["PHOTO_02", "PHOTO_03", "PHOTO_04"],
  secretPhoto: "SECRET_PHOTO"
};

const $ = (selector) => document.querySelector(selector);
const scenes = [...document.querySelectorAll(".scene")];
let activeScene = 1;
const FIRST_MESSAGE_TYPING_MS = 3500;
const autoAdvanceTimers = new Map();

function scheduleAutoAdvance(sceneNumber, delay, beforeAdvance) {
  const scene = $(`#scene-${sceneNumber}`);
  if (!scene || scene.dataset.autoAdvanceScheduled) return;
  scene.dataset.autoAdvanceScheduled = "true";
  autoAdvanceTimers.set(sceneNumber, setTimeout(() => {
    beforeAdvance?.();
    $(`#scene-${sceneNumber + 1}`)?.scrollIntoView({ behavior: "smooth" });
  }, delay));
}

function renderPersonalLetter() {
  const { intro, paragraphs, signature } = CONTENT.personalLetter;
  $("#letterIntro").textContent = intro;
  $("#letterSignature").textContent = signature;
  const body = $("#letterBody");
  body.replaceChildren(...paragraphs.map((paragraph) => {
    const element = document.createElement("p");
    element.className = "letter-paragraph";
    element.dataset.letterText = paragraph;
    return element;
  }));
}

function revealPersonalLetter() {
  const scene = $("#scene-10");
  if (scene.dataset.revealed) return;
  scene.dataset.revealed = "true";
  scene.classList.add("letter-revealing");
  const paragraphs = [...document.querySelectorAll(".letter-paragraph")];
  const signature = $("#letterSignature");
  window.AudioSystem.duckForLetter();

  const typeParagraph = (paragraphIndex) => {
    if (paragraphIndex === paragraphs.length) {
      // The signature waits until every grapheme of the final sentence is visible.
      setTimeout(() => {
        signature.classList.add("is-visible");
        scene.dataset.letterComplete = "true";
        window.AudioSystem.restoreAfterLetter();
        scheduleAutoAdvance(10, 6000);
      }, 2500);
      return;
    }
    const paragraph = paragraphs[paragraphIndex];
    const characters = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(CONTENT.personalLetter.paragraphs[paragraphIndex])]
      .map(({ segment }) => segment);
    let cursor = 0;
    paragraph.textContent = "";
    paragraph.classList.add("is-visible", "is-typing");
    const typeNextCharacter = () => {
      const character = characters[cursor];
      paragraph.textContent += character;
      // Every grapheme, including whitespace and the final emoji, has a key cue.
      window.AudioSystem.type(cursor);
      cursor += 1;
      if (cursor === characters.length) {
        paragraph.classList.remove("is-typing");
        setTimeout(() => typeParagraph(paragraphIndex + 1), 420);
        return;
      }
      const naturalRhythm = [74, 88, 102, 80, 94, 108, 85, 97];
      setTimeout(typeNextCharacter, naturalRhythm[cursor % naturalRhythm.length]);
    };
    typeNextCharacter();
  };

  // The intro fades in first; it is intentionally allowed a short quiet pause.
  setTimeout(() => typeParagraph(0), 1000);
}

renderPersonalLetter();

const startStoryButton = $("#startStory");
const startStoryText = [...startStoryButton.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
const startStoryArrow = startStoryButton.querySelector("span");

function setStartStoryReady(ready) {
  startStoryButton.disabled = !ready;
  startStoryButton.setAttribute("aria-busy", String(!ready));
  startStoryText.nodeValue = ready ? "เริ่มเรื่องราวของเรา " : "กำลังเตรียมเรื่องราวของเรา... ";
  startStoryArrow.style.visibility = ready ? "visible" : "hidden";
}

setStartStoryReady(false);
window.AudioSystem.whenOpeningReady().then(
  () => setStartStoryReady(true),
  (error) => console.error("Opening music is unavailable; Start remains disabled.", error),
);

startStoryButton.addEventListener("click", () => {
  window.AudioSystem.start();
  $("#audioToggle").hidden = false;
  $("#scene-2").scrollIntoView({ behavior: "smooth" });
});

function typeFirstMessage() {
  const target = $("#typedMessage");
  // This can be called by both the start button and the scene observer.
  // Guard the in-progress state so two timers never append Thai characters together.
  if (target.dataset.complete || target.dataset.typing) return;
  target.dataset.typing = "true";
  const phrase = "“ยิ้มหน้ารักจังง”";
  // Type complete grapheme clusters, never isolated Thai vowels or tone marks.
  const characters = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(phrase)]
    .map(({ segment }) => segment);
  target.textContent = "...";
  target.classList.add("typing-indicator");
  window.AudioSystem.beginFirstMessage(() => {
    let cursor = 0;
    // Small, varied pauses make the phone-message rhythm feel human.
    const naturalRhythm = [0.92, 1.11, 0.97, 1.08, 0.9, 1.05, 0.96];
    const baseDelay = FIRST_MESSAGE_TYPING_MS / characters.length;
    const typeNextCharacter = () => {
      // Keep the waiting indicator visible until the exact moment typing starts.
      if (cursor === 0) {
        target.textContent = "";
        target.classList.remove("typing-indicator");
      }
      target.textContent += characters[cursor];
      window.AudioSystem.type(cursor);
      cursor += 1;
      if (cursor === characters.length) {
        target.dataset.complete = "true";
        delete target.dataset.typing;
        window.AudioSystem.startPunAtCue();
        revealScene2LowerText();
        return;
      }
      setTimeout(typeNextCharacter, baseDelay * naturalRhythm[cursor % naturalRhythm.length]);
    };
    setTimeout(typeNextCharacter, baseDelay * naturalRhythm[0]);
  });
}

function revealScene2LowerText() {
  const copy = $("#scene-2 .scene2-lower-copy");
  if (copy.dataset.revealed) return;
  copy.dataset.revealed = "true";
  const revealDelays = [650, 3650, 8650];
  [...copy.querySelectorAll(".scene2-lower-line")].forEach((line, index) => {
    setTimeout(() => line.classList.add("is-visible"), revealDelays[index]);
  });
  scheduleAutoAdvance(2, 14650);
}

const photoDialog = $("#photoDialog");
document.querySelectorAll("[data-photo]").forEach((element) => element.addEventListener("click", () => {
  if (element.classList.contains("gallery-card") && !element.classList.contains("active")) return;
  const caption = element.dataset.photo;
  const dialogPhoto = $("#dialogPhoto");
  dialogPhoto.replaceChildren();
  if (element.dataset.photoSrc) {
    const image = document.createElement("img");
    image.src = element.dataset.photoSrc;
    image.alt = caption;
    dialogPhoto.append(image);
  } else {
    dialogPhoto.textContent = caption.split(" — ")[0];
  }
  $("#dialogCaption").textContent = caption;
  photoDialog.showModal();
}));
document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

let galleryIndex = 0;
let memorySequenceStarted = false;
let memorySequenceTimers = [];
let memoryCaptionTimer;
const galleryCards = [...document.querySelectorAll(".gallery-card")];
function updateMemoryCaption(caption, immediate = false) {
  const label = $("#memoryCaption");
  if (label.textContent === caption && !label.classList.contains("is-changing")) return;
  clearTimeout(memoryCaptionTimer);
  if (immediate) {
    label.textContent = caption;
    label.classList.remove("is-changing");
    return;
  }
  label.classList.add("is-changing");
  memoryCaptionTimer = setTimeout(() => {
    label.textContent = caption;
    label.classList.remove("is-changing");
  }, 300);
}
function updateGallery(direction = 0, immediateCaption = false) {
  galleryIndex = (galleryIndex + direction + galleryCards.length) % galleryCards.length;
  galleryCards.forEach((card, index) => {
    card.classList.toggle("active", index === galleryIndex);
    card.classList.toggle("preview-one", index === (galleryIndex + 1) % galleryCards.length);
    card.classList.toggle("preview-two", index === (galleryIndex + 2) % galleryCards.length);
  });
  $("#galleryIndex").textContent = `${String(galleryIndex + 1).padStart(2, "0")} / 03`;
  updateMemoryCaption(galleryCards[galleryIndex].dataset.photo, immediateCaption);
}
function revealMemoryReflection() {
  setTimeout(() => {
    $("#scene-5 .key-line").classList.add("is-visible");
    scheduleAutoAdvance(5, 14000, stopMemoryLoop);
  }, 650);
}
function stopMemoryLoop() {
  memorySequenceTimers.forEach(clearTimeout);
  memorySequenceTimers = [];
  memorySequenceStarted = false;
}
function scheduleMemoryLoop() {
  memorySequenceTimers.push(setTimeout(() => {
    galleryIndex = 1;
    updateGallery();
    memorySequenceTimers.push(setTimeout(() => {
      galleryIndex = 2;
      updateGallery();
      memorySequenceTimers.push(setTimeout(() => {
        const reflection = $("#scene-5 .key-line");
        const isFirstLoop = !reflection.classList.contains("is-visible");
        if (isFirstLoop) revealMemoryReflection();
        memorySequenceTimers.push(setTimeout(() => {
          galleryIndex = 0;
          updateGallery();
          scheduleMemoryLoop();
        }, isFirstLoop ? 650 : 0));
      }, 4000));
    }, 4000));
  }, 4000));
}
$("#previousPhoto").addEventListener("click", () => { updateGallery(-1); });
$("#nextPhoto").addEventListener("click", () => { updateGallery(1); });
galleryCards.forEach((card, index) => card.addEventListener("click", () => {
  if (!card.classList.contains("active")) { galleryIndex = index; updateGallery(); }
}));

function startMemorySequence() {
  if (memorySequenceStarted) return;
  memorySequenceStarted = true;
  updateGallery(0, true);
  scheduleMemoryLoop();
}

function revealFakeEnding() {
  const scene = $("#scene-11");
  if (scene.dataset.revealed) return;
  scene.dataset.revealed = "true";
  scene.classList.add("fake-ending-ready");
}

$("#fakeEndButton").addEventListener("click", () => {
  const scene = $("#scene-11");
  if (scene.dataset.opened) return;
  scene.dataset.opened = "true";
  scene.classList.add("fake-ending-opened");
  // The final two lines settle, then the music leaves before the countdown.
  setTimeout(() => {
    window.AudioSystem.completeFakeEnding();
    setTimeout(() => {
      window.AudioSystem.silence();
      setTimeout(() => $("#scene-12").scrollIntoView({ behavior: "smooth" }), 1750);
    }, 6000);
  }, 5050);
});

$("#secretTrigger").addEventListener("click", () => {
  const scene = $("#scene-15");
  if (scene.dataset.opened) return;
  scene.dataset.opened = "true";
  window.AudioSystem.sparkle();
  scene.classList.add("secret-opening");
  setTimeout(() => {
    $("#secretTrigger").setAttribute("aria-hidden", "true");
    $("#secretTrigger").style.display = "none";
    $(".secret-hint").style.display = "none";
    $("#secretContent").classList.add("show");
    scheduleAutoAdvance(15, 18800);
  }, 1650);
});

$("#countdownStart").addEventListener("click", runCountdown);
function runCountdown() {
  const start = $("#countdownStart");
  const number = $("#countdownNumber");
  const note = $("#countdownNote");
  const scene = $("#scene-12");
  if (scene.dataset.running) return;
  scene.dataset.running = "true";
  scene.classList.add("countdown-running");
  start.disabled = true;
  window.AudioSystem.countdownStart();
  const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  let index = 0;

  const showNextNumber = () => {
    const value = values[index];
    number.textContent = value;
    number.classList.remove("countdown-number-in");
    void number.offsetWidth;
    number.classList.add("countdown-number-in");
    window.AudioSystem.countdownTick(value); // Exactly one heartbeat for this number.

    const holdTime = value === 1 ? 1800 : value === 2 ? 1550 : 1400;
    setTimeout(() => {
      if (value !== 1) {
        index += 1;
        showNextNumber();
        return;
      }

      number.textContent = "";
      window.AudioSystem.silence();
      setTimeout(() => {
        const videoButton = $("#openVideo");
        videoButton.disabled = false;
        $("#scene-13").classList.remove("locked");
        $("#scene-13").scrollIntoView({ behavior: "smooth" });
      }, 1000);
    }, holdTime);
  };

  showNextNumber();
}

const videoDialog = $("#videoDialog");
const surpriseVideo = $("#surpriseVideo");
let videoIsPlaying = false;

$("#openVideo").addEventListener("click", async () => {
  if (videoIsPlaying) return;
  const button = $("#openVideo");
  videoIsPlaying = true;
  button.disabled = true;
  $("#videoStatus").textContent = "";
  window.AudioSystem.stopForVideo();
  surpriseVideo.currentTime = 0;
  surpriseVideo.volume = 0.125;
  videoDialog.showModal();
  try {
    await surpriseVideo.play();
  } catch {
    videoIsPlaying = false;
    button.disabled = false;
    if (videoDialog.open) videoDialog.close();
    $("#videoStatus").textContent = "ไม่สามารถเปิดวิดีโอได้ ลองแตะอีกครั้งนะ";
  }
});

surpriseVideo.addEventListener("ended", () => {
  videoIsPlaying = false;
  if (videoDialog.open) videoDialog.close();
  // Let the ending sit in total silence before the familiar song returns.
  setTimeout(() => {
    window.AudioSystem.resumeAfterVideo();
    window.AudioSystem.setScene(14);
    $("#scene-14").scrollIntoView({ behavior: "smooth" });
  }, 1500);
});

videoDialog.addEventListener("close", () => {
  if (surpriseVideo.ended) return;
  surpriseVideo.pause();
  videoIsPlaying = false;
  $("#openVideo").disabled = false;
});

$("#audioToggle").addEventListener("click", () => {
  const isMuted = window.AudioSystem.toggle();
  $("#audioToggle").textContent = isMuted ? "♩" : "♬";
  $("#audioToggle").setAttribute("aria-label", isMuted ? "เปิดเสียง" : "ปิดเสียง");
  $("#audioToggle").setAttribute("aria-pressed", String(isMuted));
});

$("#backButton").addEventListener("click", () => {
  const previous = Math.max(1, activeScene - 1);
  $(`#scene-${previous}`).scrollIntoView({ behavior: "smooth" });
});

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) {
    activeScene = Number(entry.target.dataset.scene);
    window.AudioSystem.setScene(activeScene);
    if (activeScene === 2) typeFirstMessage();
    if (activeScene === 3) {
      entry.target.classList.add("scene3-revealed");
      scheduleAutoAdvance(3, 12100);
    }
    if (activeScene === 4) {
      entry.target.classList.add("scene4-revealed");
      scheduleAutoAdvance(4, 17800);
    }
    if (activeScene === 5) startMemorySequence();
    if (activeScene === 6) {
      entry.target.classList.add("scene6-revealed");
      scheduleAutoAdvance(6, 31350);
    }
    if (activeScene === 7) {
      entry.target.classList.add("scene7-revealed");
      scheduleAutoAdvance(7, 13650);
    }
    if (activeScene === 8) {
      entry.target.classList.add("scene8-revealed");
      scheduleAutoAdvance(8, 21600);
    }
    if (activeScene === 9) {
      entry.target.classList.add("scene9-revealed");
      scheduleAutoAdvance(9, 23750);
    }
    if (activeScene === 10) revealPersonalLetter();
    if (activeScene === 11) revealFakeEnding();
    if (activeScene === 14) {
      entry.target.classList.add("scene14-revealed");
      scheduleAutoAdvance(14, 19250);
    }
    if (activeScene === 16) {
      entry.target.classList.add("active");
      scheduleAutoAdvance(16, 23000);
    }
    if (activeScene === 17) window.AudioSystem.finish();
  }
}), { threshold: .55 });
scenes.forEach((scene) => observer.observe(scene));
