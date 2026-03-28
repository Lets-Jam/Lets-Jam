const songMetaById = {
  "Maroon5-sugar": {
    title: "SUGAR",
    artist: "Maroon 5",
  },
  TheNights: {
    title: "THE NIGHTS",
    artist: "Avicii",
  },
  September: {
    title: "SEPTEMBER",
    artist: "Earth, Wind & Fire",
  },
};

export function getSongMeta(songId) {
  return (
    songMetaById[songId] || {
      title: songId ? songId.toUpperCase() : "NO SONG",
      artist: "Unknown Artist",
    }
  );
}
