const str = (v) => (typeof v === "string" && v.length > 0 ? v : null);

export function vodToPreview(item) {
  const ext = str(item.container_extension) || "mp4";
  return {
    id: `xc:v:${item.stream_id}:${ext}`,
    type: "movie",
    name: str(item.name) || "Untitled",
    poster: str(item.stream_icon),
    posterShape: "poster",
  };
}

export function seriesToPreview(item) {
  return {
    id: `xc:s:${item.series_id}`,
    type: "series",
    name: str(item.name) || "Untitled",
    poster: str(item.cover),
    posterShape: "poster",
  };
}

function splitPeople(v) {
  return str(v) ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function yearOf(dateStr) {
  const m = /^(\d{4})/.exec(str(dateStr) || "");
  return m ? m[1] : null;
}

export function vodInfoToMeta(id, info = {}, movieData = {}) {
  const meta = {
    id,
    type: "movie",
    name: str(info.name) || str(movieData.name) || "Untitled",
    poster: str(info.movie_image) || str(info.cover_big),
    posterShape: "poster",
  };
  const background = Array.isArray(info.backdrop_path) ? str(info.backdrop_path[0]) : str(info.backdrop_path);
  if (background) meta.background = background;
  const description = str(info.plot) || str(info.description);
  if (description) meta.description = description;
  const year = yearOf(info.releasedate);
  if (year) meta.releaseInfo = year;
  const rating = parseFloat(info.rating);
  if (rating > 0) meta.imdbRating = String(info.rating);
  const runtime = parseInt(info.episode_run_time, 10);
  if (runtime > 0) meta.runtime = `${runtime} min`;
  const cast = splitPeople(info.cast || info.actors);
  if (cast.length) meta.cast = cast;
  const director = splitPeople(info.director);
  if (director.length) meta.director = director;
  const genres = splitPeople(info.genre);
  if (genres.length) meta.genres = genres;
  if (str(info.youtube_trailer)) meta.trailers = [{ source: info.youtube_trailer, type: "Trailer" }];
  return meta;
}

export function seriesInfoToMeta(seriesId, info = {}, episodes = {}) {
  const meta = {
    id: `xc:s:${seriesId}`,
    type: "series",
    name: str(info.name) || "Untitled",
    poster: str(info.cover),
    posterShape: "poster",
  };
  const background = Array.isArray(info.backdrop_path) ? str(info.backdrop_path[0]) : str(info.backdrop_path);
  if (background) meta.background = background;
  if (str(info.plot)) meta.description = info.plot;
  const year = yearOf(info.releaseDate);
  if (year) meta.releaseInfo = year;
  const rating = parseFloat(info.rating);
  if (rating > 0) meta.imdbRating = String(info.rating);
  const genres = splitPeople(info.genre);
  if (genres.length) meta.genres = genres;

  meta.videos = [];
  for (const [seasonKey, eps] of Object.entries(episodes || {})) {
    if (!Array.isArray(eps)) continue;
    for (const ep of eps) {
      if (ep == null || ep.id == null) continue;
      const video = {
        id: `xc:e:${ep.id}:${str(ep.container_extension) || "mp4"}`,
        title: str(ep.title) || `Episode ${ep.episode_num}`,
        season: Number(seasonKey) || 0,
        episode: Number(ep.episode_num) || 0,
      };
      const thumb = str(ep.info && ep.info.movie_image);
      if (thumb) video.thumbnail = thumb;
      const overview = str(ep.info && ep.info.plot);
      if (overview) video.overview = overview;
      meta.videos.push(video);
    }
  }
  return meta;
}

export function liveToPreview(item) {
  return {
    id: `xc:l:${item.stream_id}`,
    type: "tv",
    name: str(item.name) || "Untitled",
    poster: str(item.stream_icon),
    posterShape: "square",
  };
}

export function liveToMeta(item, categories = []) {
  const meta = {
    id: `xc:l:${item.stream_id}`,
    type: "tv",
    name: str(item.name) || "Untitled",
    poster: str(item.stream_icon),
    posterShape: "square",
  };
  if (str(item.stream_icon)) meta.logo = item.stream_icon;
  const cat = categories.find((c) => String(c.category_id) === String(item.category_id));
  if (cat && str(cat.category_name)) meta.genres = [cat.category_name];
  return meta;
}

// Panels use fake "channels" full of #### or ==== as visual separators.
export function isRealChannel(item) {
  const name = str(item.name);
  return Boolean(name) && !/[#=]{3,}/.test(name);
}

export function parseId(id) {
  if (typeof id !== "string") return null;
  const parts = id.split(":");
  if (parts[0] !== "xc") return null;
  if (parts[1] === "v" && parts[2] && parts[3]) return { kind: "movie", streamId: parts[2], ext: parts[3] };
  if (parts[1] === "s" && parts[2]) return { kind: "series", seriesId: parts[2] };
  if (parts[1] === "e" && parts[2] && parts[3]) return { kind: "episode", episodeId: parts[2], ext: parts[3] };
  if (parts[1] === "l" && parts[2]) return { kind: "live", streamId: parts[2] };
  return null;
}
