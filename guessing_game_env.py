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
        self.observation = np.zeros((num_agents, 1), dtype=np.float32)
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
        obs = np.zeros((self.num_agents, 1), dtype=np.float32)
        return obs, np.array(rewards), np.array(dones)

    def reset(self):
        self.current_guesses = ["" for _ in range(self.num_agents)]
        self.done = [False for _ in range(self.num_agents)]
        self.observation = np.zeros((self.num_agents, 1), dtype=np.float32)
        if self.verbose:
            print(f"Reset environment with target: '{self.target_sentence}'")
        return self.observation

    def was_completed(self, agent_idx):
        return self.current_guesses[agent_idx] == self.target_sentence

    @property
    def character_dictionary(self):
        return sorted(set(self.target_sentence))
