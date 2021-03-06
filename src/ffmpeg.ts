export const commonOptions = [
  "-hide_banner",
  "-loglevel",
  "warning",
  // "-stats",
];

export const commonConvertOptions = [
  // remove chapter info
  "-map_chapters",
  "-1",
  "-map_metadata",
  "-1",
];

export const mp4Options = [
  ...commonConvertOptions,
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart+frag_keyframe+empty_moov",
  // quality
  "-crf",
  "20",
  "-c:a",
  "aac",
  // "-vf",
  // `subtitles=filename=${escapeFilter(fullPath)}`,
  "-f",
  "mp4",
];

export const webmOptions = [
  ...commonConvertOptions,
  "-c:v",
  "libvpx",
  // quality
  "-b:v",
  "1M",
  "-c:a",
  "libvorbis",
  // "-vf",
  // `subtitles=filename=${escapeFilter(fullPath)}`,
  // remove subtitles info
  "-sn",
  "-f",
  "webm",
];
