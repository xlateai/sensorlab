

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
    import jax
    import jax.numpy as jnp
    from audiolab.rl.parameter_group import LinearLayerParamGroup
    from colorama import Fore, Style, init

    # --- Hyperparameters ---
    NUM_AGENTS = 8
    TARGET_SENTENCE = "Hello there, have you cracked the code?"
    CHUNK_SIZE = 1  # obs shape is (num_agents, 1)
    EMBEDDING_SIZE = 16
    NUM_EPISODES = 100
    FMC_BALANCE = 1.0
    KEEP_TOP_PERCENT = 0.25

    # --- Environment ---
    env = GuessingGameVecEnv(num_agents=NUM_AGENTS, target_sentence=TARGET_SENTENCE, verbose=False)
    char_dict = env.character_dictionary
    dict_size = len(char_dict)
    char_to_int = {c: i for i, c in enumerate(char_dict)}
    int_to_char = {i: c for i, c in enumerate(char_dict)}

    # --- Agent Group ---
    class AgentGroup:
        def __init__(self, key, num_agents, chunk_size, embedding_size):
            self.num_agents = num_agents
            self.key = key
            self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
            self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
            self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, dict_size)
            self.groups = [self.layer1, self.layer2, self.layer3]

        def forward(self, obs):
            h1 = self.layer1.forward(obs)
            h1 = jax.nn.relu(h1)
            h2 = self.layer2.forward(h1)
            h2 = jax.nn.relu(h2)
            out = self.layer3.forward(h2)
            return out

        def random_distances(self):
            self.key, skey = jax.random.split(self.key, 2)
            self._pair_indices = jax.random.randint(skey, (self.num_agents,), 0, self.num_agents)
            d1 = self.layer1.distances(self._pair_indices)
            d2 = self.layer2.distances(self._pair_indices)
            d3 = self.layer3.distances(self._pair_indices)
            return (d1 + d2 + d3) / 3.0

        def clone(self, clone_indices, partner_indices):
            for group in self.groups:
                group.clone(clone_indices, partner_indices)

    def relativize(vector):
        std = vector.std()
        if std == 0:
            return jnp.ones(len(vector))
        standard = (vector - vector.mean()) / std
        standard = standard.at[standard > 0].set(jnp.log(1 + standard[standard > 0]) + 1)
        standard = standard.at[standard <= 0].set(jnp.exp(standard[standard <= 0]))
        return standard

    key = jax.random.PRNGKey(0)
    agents = AgentGroup(key, NUM_AGENTS, CHUNK_SIZE, EMBEDDING_SIZE)

    for episode_i in range(NUM_EPISODES):
        obs = env.reset()
        done = [False] * NUM_AGENTS
        total_rewards = jnp.zeros(NUM_AGENTS)
        step_idx = 0
        while not all(done):
            # Forward pass: get logits for each agent
            logits = agents.forward(jnp.array(obs, dtype=jnp.float32))
            # Choose actions: argmax over logits
            action_indices = jnp.argmax(logits, axis=1)
            actions = [int_to_char[int(idx)] for idx in action_indices]
            obs, rewards, dones = env.step(actions)
            total_rewards += rewards * (~jnp.array(done))
            done = dones.tolist() if hasattr(dones, 'tolist') else list(dones)
            step_idx += 1
            if step_idx >= len(TARGET_SENTENCE):
                break

        # --- FMC Update ---
        pair_distances = agents.random_distances()
        print(pair_distances.mean(), "pair dists")
        rel_dists = relativize(pair_distances)
        scores = relativize(total_rewards) ** FMC_BALANCE
        vr = scores * rel_dists
        partner_vr = vr[agents._pair_indices]
        value = (partner_vr - vr) / jnp.where(vr > 0, vr, 1e-8)
        agents.key, skey = jax.random.split(agents.key, 2)
        r = jax.random.uniform(skey, (NUM_AGENTS, ))
        will_clone = value >= r
        top_agent_indices = total_rewards.argsort()[-int(NUM_AGENTS * KEEP_TOP_PERCENT):]
        arange = jnp.arange(NUM_AGENTS)
        will_clone = jnp.where(jnp.isin(arange, top_agent_indices), False, will_clone)
        clone_indices = arange[will_clone]
        partner_indices = agents._pair_indices[will_clone]
        agents.clone(clone_indices, partner_indices)

        # --- Output ---
        print(f"Episode {episode_i}: Max Reward: {jnp.max(total_rewards)}/{len(TARGET_SENTENCE)}, Min Reward: {jnp.min(total_rewards)}, Mean Reward: {jnp.mean(total_rewards):.2f}")
        print(f"Best complete percent: {jnp.max(total_rewards)/len(TARGET_SENTENCE)*100:.2f}%")
        print(f"Number of agents that cloned: {jnp.sum(will_clone)} out of {NUM_AGENTS}")

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