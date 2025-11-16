

import numpy as np
import random

class GuessingGameVecEnv:
    """
    Vectorized guessing game environment for multiple agents.
    Each agent tries to guess the target sentence one character at a time.
    Observations are arrays of zeros (one per agent).
    """
    def __init__(self, num_agents: int = 8, target_sentence: str = "Hello there, have you cracked the code?", verbose: bool = False):
        self.num_agents = num_agents
        self.target_sentence = target_sentence
        self.verbose = verbose
        self.current_guesses = ["" for _ in range(num_agents)]
        self.done = [False for _ in range(num_agents)]
        self.observation = np.zeros((num_agents, 1), dtype=np.int32)
        self.reset()

    def step(self, actions):
        """
        actions: list of character guesses, length = num_agents
        Returns:
            obs: np.ndarray (num_agents, 1)
            rewards: np.ndarray (num_agents,)
            dones: np.ndarray (num_agents,)
        """
        rewards = []
        dones = []
        new_guesses = []
        for i in range(self.num_agents):
            if self.done[i]:
                rewards.append(0)
                dones.append(True)
                new_guesses.append(self.current_guesses[i])
                continue
            guess = self.current_guesses[i]
            current_pos = len(guess)
            if current_pos >= len(self.target_sentence):
                rewards.append(0)
                dones.append(True)
                new_guesses.append(guess)
                self.done[i] = True
                continue
            expected_char = self.target_sentence[current_pos]
            action = actions[i]
            if action == expected_char:
                guess += action
                reward = 1
            else:
                guess += action
                reward = 0
            new_guesses.append(guess)
            done = len(guess) >= len(self.target_sentence)
            rewards.append(reward)
            dones.append(done)
            self.done[i] = done
        self.current_guesses = new_guesses
        obs = np.array([[len(guess)] for guess in self.current_guesses], dtype=np.int32)
        return obs, np.array(rewards), np.array(dones)

    def reset(self):
        self.current_guesses = ["" for _ in range(self.num_agents)]
        self.done = [False for _ in range(self.num_agents)]
        self.observation = np.zeros((self.num_agents, 1), dtype=np.int32)
        if self.verbose:
            print(f"Reset environment with target: '{self.target_sentence}'")
        return self.observation

    def was_completed(self, agent_idx):
        return self.current_guesses[agent_idx] == self.target_sentence

    @property
    def character_dictionary(self):
        return sorted(set(self.target_sentence))


if __name__ == "__main__":
    from colorama import Fore, Style, init
    
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


    char_to_int = {c: i for i, c in enumerate(sorted(set(TARGET_SENTENCE)))}
    print("Guesses table (integers, green=correct):")
    for agent_idx, agent_guess in enumerate(env.current_guesses):
        row = []
        for pos, c in enumerate(agent_guess):
            val = str(char_to_int.get(c, -1))
            if pos < len(TARGET_SENTENCE) and c == TARGET_SENTENCE[pos]:
                row.append(Fore.GREEN + val + Style.RESET_ALL)
            else:
                row.append(val)
        print(" ".join(row))

    print("Target sentence:", TARGET_SENTENCE, "Len:", len(TARGET_SENTENCE))
    print("Total reward vector:", total_rewards)