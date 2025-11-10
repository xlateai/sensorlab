import gymnasium as gym

class TranscriptionEnvironmentSingleInstance(gym.Env):
    """Basically, an agent's goal is to be given each timestep
    of the audio and predict either NULL or a character.

    The sooner the agent can predict the correct next character,
    the higher their reward will be.

    Ideally, the agent predicts NULL until they are 100% certain of the next
    character.
    """
    
    def __init__(self, max_samples: int=4):
        pass

    def step(self, action):
        pass

    def reset(self, *, seed=None, options=None):
        pass

