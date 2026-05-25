import { makeAutoObservable } from 'mobx';
import { soundManager } from './soundManager';

export interface DrawnCard {
  card: {
    id: string;
    name: string;
    orientation: 'upright' | 'reversed';
  };
  orientation: 'upright' | 'reversed';
}

class DrawStore {
  drawnCards: DrawnCard[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  onCardSelect(card: DrawnCard) {
    this.drawnCards.push(card);
    soundManager.playRandomEffect(); // Play random sound effect on card selection
  }
}

export const drawStore = new DrawStore();
