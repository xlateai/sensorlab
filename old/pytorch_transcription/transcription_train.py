from environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent

import torch


# CHUNK_SIZE = 1024
CHUNK_SIZE = 256
# CHUNK_SIZE = 32

NUM_EPISODES = 100


def safe_chr(code):
    # Clamp to valid range
    code = int(code)
    if 0xD800 <= code <= 0xDFFF:
        code = 0xE000  # Skip surrogate range to next valid code point
    return chr(code)

if __name__ == "__main__":
    
    env = TranscriptionEnvironmentSingleInstance(max_samples=4, chunk_size=CHUNK_SIZE)
    agent = TranscriptionMemoryCellAgent(embedding_size=32, chunk_size=CHUNK_SIZE)
    optimizer = torch.optim.Adam(agent.parameters(), lr=0.001)
    
    for episode_i in range(NUM_EPISODES):
        print("episode", episode_i)

        total_epoch_loss = 0.0

        timestep = 0
        done = False
        obs, info = env.reset()

        while not done:
            optimizer.zero_grad()

            # Get prediction from agent (Beta distribution returns values in [0,1])
            raw_sample = agent.forward(obs)
            # distribution = agent.forward(obs)
            # raw_sample = distribution.sample()
            # raw_sample = distribution.mean  # use mean because why not
            # print(f"Raw sample (0-1): {raw_sample.item():.4f}")
            
            # Scale from [0,1] to character range [32, 65535]
            scaled_sample = raw_sample * (65535 - 32) + 32
            guess = safe_chr(int(scaled_sample.item()))
            
            obs, reward, done, truncated, info = env.step(guess)
            expected_char = info.get('expected', None)
            expected_char_integer = ord(expected_char) if expected_char else None

            # for now, let's just increase the probability of the correct action
            normalized_expected = (expected_char_integer - 32) / (65535 - 32)
            assert 0.0 <= normalized_expected <= 1.0, f"Normalized expected {normalized_expected} out of bounds for char '{expected_char}' ({expected_char_integer})"
            target = torch.tensor([[normalized_expected]], dtype=torch.float32)
            # log_prob = distribution.log_prob(target)
            # loss = -log_prob  # don't need reward multiply because this is the optimal action

            # print(distribution.concentration0, distribution.concentration1)

            # loss is mae

            was_correct = info.get('correct', False)
            if not was_correct:
                loss = torch.square(raw_sample - target).mean()
                loss.backward()
                optimizer.step()
                total_epoch_loss += loss.item()

            # print(f"[{episode_i}/{timestep}]", guess, expected_char, reward, raw_sample, obs.shape, env.current_audio_timestep)
            timestep += 1

            if env.was_completed:
                print(f"Full completion of transcription!!! 100%!")

            if done:
                break

        print(f"Episode {episode_i} average loss: {total_epoch_loss / timestep:.4f}")
        