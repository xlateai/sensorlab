from datasets import load_dataset
import numpy as np
import pygame
import time

dataset = load_dataset("amphion/Emilia-Dataset", streaming=True)
print(dataset) # features: ['json', 'mp3', '__key__', '__url__'], num_shards: 4343

# Get first sample
first_sample = next(iter(dataset['train']))
print(f"Text: {first_sample['json']['text']}")
print(f"Language: {first_sample['json']['language']}")
print(f"Duration: {first_sample['json']['duration']} seconds")
print(f"Speaker: {first_sample['json']['speaker']}")

# Play audio directly from raw data
audio_data = first_sample['mp3']['array']
sample_rate = first_sample['mp3']['sampling_rate']

print(f"Playing audio: '{first_sample['json']['text']}'")

# Initialize pygame mixer
pygame.mixer.init(frequency=sample_rate, size=-16, channels=1, buffer=1024)

# Convert float32 to int16 for pygame
audio_int16 = (audio_data * 32767).astype(np.int16)

# Create pygame sound object and play
sound = pygame.sndarray.make_sound(audio_int16)
sound.play()

# Wait for audio to finish
time.sleep(first_sample['json']['duration'])
pygame.mixer.quit()
