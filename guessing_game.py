
from guessing_game_env import GuessingGameVecEnv
import random

NUM_AGENTS = 8
TARGET_SENTENCE = "Hello there, have you cracked the code?"

# Create environment
env = GuessingGameVecEnv(num_agents=NUM_AGENTS, target_sentence=TARGET_SENTENCE, verbose=False)

# Pre-generate random guesses for each agent
char_dict = env.character_dictionary
random.seed(42)
pre_generated_actions = [
    [random.choice(char_dict) for _ in range(len(TARGET_SENTENCE))]
    for _ in range(NUM_AGENTS)
]

obs = env.reset()
done = [False] * NUM_AGENTS
step_idx = 0
total_rewards = [0] * NUM_AGENTS

while not all(done):
    actions = [pre_generated_actions[i][step_idx] if not done[i] else env.target_sentence[-1] for i in range(NUM_AGENTS)]
    obs, rewards, dones = env.step(actions)
    for i in range(NUM_AGENTS):
        total_rewards[i] += rewards[i]
    done = dones.tolist() if hasattr(dones, 'tolist') else list(dones)
    step_idx += 1
    if step_idx >= len(TARGET_SENTENCE):
        break


# Print table of guesses in integer form
char_to_int = {c: i for i, c in enumerate(sorted(set(TARGET_SENTENCE)))}
guesses_table = []
for agent_guess in env.current_guesses:
    guesses_table.append(" ".join([str(char_to_int.get(c, -1)) for c in agent_guess]))

print("Guesses table (integers):")
for row in guesses_table:
    print(row)

print("Target sentence:", TARGET_SENTENCE, "Len:", len(TARGET_SENTENCE))
print("Total reward vector:", total_rewards)



