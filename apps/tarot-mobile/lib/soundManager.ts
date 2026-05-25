import { Audio as ExpoAudio } from 'expo-av';

interface SoundManager {
  playRandomEffect(): Promise<void>;
}

const SoundEffectFiles: number[] = [
  require('../../assets/sounds/effect1.mp3'),
  require('../../assets/sounds/effect2.mp3'),
  require('../../assets/sounds/effect3.mp3'),
  require('../../assets/sounds/effect4.mp3'),
];

export const soundManager: SoundManager = {
  async playRandomEffect() {
    const randomIndex = Math.floor(Math.random() * SoundEffectFiles.length);
    const file = SoundEffectFiles[randomIndex];

    const { sound } = await ExpoAudio.Sound.createAsync(file);
    try {
      await sound.playAsync();
    } catch (error) {
      console.error('Failed to play sound', error);
    } finally {
      sound.unloadAsync(); // Ensure resources are released after playback
    }
  }
};
