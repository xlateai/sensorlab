

// Class to manage stateful transliteration
export class Transliterator {
    private upcomingObjects: Array<{ string: string; reading?: string; english: string }>;
    private completedObjects: Array<{ string: string; reading?: string; english: string }> = [];
    private buffer: string = '';
    private originalObjects: Array<{ string: string; reading?: string; english: string }> = [];
  
    constructor(sentenceObjects: Array<{ string: string; reading?: string; english: string }>) {
      this.upcomingObjects = [...sentenceObjects];
      this.originalObjects = [...sentenceObjects];
      this.completedObjects = [];
      this.buffer = '';
    }
  
    // Call this for each keystroke
    update(char: string): { completed: Array<{ string: string; reading?: string; english: string }>, buffer: string, upcoming: Array<{ string: string; reading?: string; english: string }> } {
      this.buffer += char;
      // Only check the first upcoming object
      if (this.upcomingObjects.length > 0) {
        const nextObj = this.upcomingObjects[0];
        // Special case: if obj.string is 'は', allow 'ha' or 'wa'
        const validEnglish = (nextObj.string === 'は') ? ['ha', 'wa'] : [nextObj.english];
        if (validEnglish.includes(this.buffer)) {
          // Pop from upcoming, push to completed
          this.completedObjects.push(nextObj);
          this.upcomingObjects.shift();
          this.buffer = '';
        }
      }
      return {
        completed: [...this.completedObjects],
        buffer: this.buffer,
        upcoming: [...this.upcomingObjects],
      };
    }
  
    // Optionally, expose a method to get the current sentence string
    getCompletedString(): string {
      return this.completedObjects.map(o => o.string).join('');
    }
  
    reset() {
      this.completedObjects = [];
      this.upcomingObjects = [...this.originalObjects];
      this.buffer = '';
    }
  }