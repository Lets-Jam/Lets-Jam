import { maroon5SugarLrc } from "./maroon5Sugar";
import { septemberLrc } from "./september";
import { theNightsLrc } from "./theNights";

function parseTimeTag(tag) {
  const match = tag.match(/\[(\d{2}):(\d{2}\.\d{2})\]/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

function parseLrc(lrc) {
  return lrc
    .trim()
    .split("\n")
    .map((rawLine) => rawLine.trim())
    .filter(Boolean)
    .map((line) => {
      const time = parseTimeTag(line);
      const text = line.replace(/^\[\d{2}:\d{2}\.\d{2}\]/, "").trim();
      return time === null || !text ? null : { time, text };
    })
    .filter(Boolean);
}

const timedLyricsBySongId = {
  "Maroon5-sugar": parseLrc(maroon5SugarLrc),
  September: parseLrc(septemberLrc),
  TheNights: parseLrc(theNightsLrc),
};

export function getTimedLyrics(songId) {
  return timedLyricsBySongId[songId] || [];
}

export function getActiveLyricIndex(lyrics, currentTime) {
  if (!lyrics.length) return -1;

  for (let index = lyrics.length - 1; index >= 0; index -= 1) {
    if (currentTime >= lyrics[index].time) {
      return index;
    }
  }

  return -1;
}
