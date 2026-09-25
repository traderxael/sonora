import * as db from '../lib/db';
import { uid, colorFromString } from '../lib/utils';
import type { Playlist, RemoteCandidate, Track } from '../lib/types';
import { LIKES_ID, getState, upsertPlaylist, upsertTracks, removePlaylist, getPlaylist, removeTracks } from './store';
import { candidateToTrack } from '../sources';

const ACCENTS = ['#7c5cff', '#1db954', '#ff6b6b', '#ffa62b', '#2ec4b6', '#4d96ff', '#f473b6', '#9be564'];

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: uid('pl'),
    name: name.trim() || 'Nueva playlist',
    trackIds: [...new Set(trackIds)],
    createdAt: now,
    updatedAt: now,
    accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
  };
  await db.putPlaylist(playlist);
  upsertPlaylist(playlist);
  return playlist;
}

export async function renamePlaylist(id: string, name: string, description?: string): Promise<void> {
  const playlist = getPlaylist(id);
  if (!playlist) return;
  const next: Playlist = { ...playlist, name: name.trim() || playlist.name, description, updatedAt: Date.now() };
  await db.putPlaylist(next);
  upsertPlaylist(next);
}

export async function deletePlaylistById(id: string): Promise<void> {
  if (id === LIKES_ID) return;
  await db.deletePlaylist(id);
  removePlaylist(id);
}

export async function addToPlaylist(playlistId: string, trackIds: readonly string[]): Promise<number> {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return 0;
  const set = new Set(playlist.trackIds);
  let added = 0;
  for (const id of trackIds) {
    if (!set.has(id)) {
      set.add(id);
      added++;
    }
  }
  if (added === 0) return 0;
  const next: Playlist = { ...playlist, trackIds: [...set], updatedAt: Date.now() };
  await db.putPlaylist(next);
  upsertPlaylist(next);
  return added;
}

export async function removeFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return;
  const next: Playlist = {
    ...playlist,
    trackIds: playlist.trackIds.filter((id) => id !== trackId),
    updatedAt: Date.now(),
  };
  await db.putPlaylist(next);
  upsertPlaylist(next);
}

export async function moveInPlaylist(playlistId: string, from: number, to: number): Promise<void> {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return;
  const trackIds = [...playlist.trackIds];
  if (from < 0 || from >= trackIds.length || to < 0 || to >= trackIds.length) return;
  const [moved] = trackIds.splice(from, 1);
  if (moved === undefined) return;
  trackIds.splice(to, 0, moved);
  const next: Playlist = { ...playlist, trackIds, updatedAt: Date.now() };
  await db.putPlaylist(next);
  upsertPlaylist(next);
}

export async function shufflePlaylistTracks(playlistId: string): Promise<void> {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return;
  const trackIds = [...playlist.trackIds];
  for (let i = trackIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trackIds[i], trackIds[j]] = [trackIds[j], trackIds[i]];
  }
  const next: Playlist = { ...playlist, trackIds, updatedAt: Date.now() };
  await db.putPlaylist(next);
  upsertPlaylist(next);
}

export async function toggleLike(trackId: string): Promise<boolean> {
  const now = Date.now();
  const existing = getPlaylist(LIKES_ID);
  if (!existing) {
    const likes: Playlist = {
      id: LIKES_ID,
      name: 'Me gusta',
      trackIds: [trackId],
      createdAt: now,
      updatedAt: now,
      accent: '#7c5cff',
    };
    await db.putPlaylist(likes);
    upsertPlaylist(likes);
    return true;
  }
  const liked = existing.trackIds.includes(trackId);
  const trackIds = liked ? existing.trackIds.filter((id) => id !== trackId) : [...existing.trackIds, trackId];
  const next: Playlist = { ...existing, trackIds, updatedAt: now };
  await db.putPlaylist(next);
  upsertPlaylist(next);
  return !liked;
}

/** Guarda un resultado de busqueda en la biblioteca como pista. */
export async function saveCandidate(candidate: RemoteCandidate): Promise<Track> {
  const track = candidateToTrack(candidate);
  const existing = getState().tracks.get(track.id);
  if (existing) return existing;
  await db.putTrack(track);
  upsertTracks([track]);
  return track;
}

export async function deleteTrackForever(trackId: string): Promise<void> {
  await db.deleteTrack(trackId);
  removeTracks([trackId]);
}

export function accentFor(name: string): string {
  return colorFromString(name, 55, 45);
}
