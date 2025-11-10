from datasets import load_dataset
dataset = load_dataset("amphion/Emilia-Dataset", streaming=True)
print(dataset) # features: ['json', 'mp3', '__key__', '__url__'], num_shards: 4343
print(next(iter(dataset['train'])))
