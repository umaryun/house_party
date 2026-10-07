export const DRAW_WORDS = [
  'pizza', 'guitar', 'rocket', 'dragon', 'banana', 'castle', 'rainbow', 'snowman', 'volcano', 'pirate',
  'robot', 'unicorn', 'cactus', 'penguin', 'sandwich', 'airplane', 'bicycle', 'mermaid', 'ghost', 'spider',
  'lighthouse', 'treasure', 'skateboard', 'hamburger', 'giraffe', 'octopus', 'umbrella', 'campfire', 'tornado', 'zombie',
  'birthday cake', 'ice cream', 'hot dog', 'popcorn', 'donut', 'cupcake', 'watermelon', 'pineapple', 'taco', 'sushi',
  'dinosaur', 'butterfly', 'elephant', 'kangaroo', 'shark', 'snail', 'owl', 'turtle', 'monkey', 'flamingo',
  'beach', 'island', 'mountain', 'desert', 'jungle', 'waterfall', 'bridge', 'pyramid', 'igloo', 'tent',
  'crown', 'sword', 'magnet', 'telescope', 'microphone', 'headphones', 'camera', 'balloon', 'kite', 'trophy',
  'sunglasses', 'backpack', 'toothbrush', 'ladder', 'anchor', 'compass', 'candle', 'hammer', 'scissors', 'key',
  'astronaut', 'wizard', 'ninja', 'vampire', 'superhero', 'chef', 'clown', 'cowboy', 'firefighter', 'doctor',
  'roller coaster', 'ferris wheel', 'disco ball', 'fireworks', 'dance floor', 'traffic light', 'haunted house', 'spaceship', 'submarine', 'tractor',
  'moon', 'sun', 'star', 'cloud', 'lightning', 'snowflake', 'tree house', 'flower', 'mushroom', 'leaf',
  'soccer', 'basketball', 'bowling', 'surfing', 'fishing', 'karate', 'yoga', 'skiing', 'swimming', 'boxing',
  'selfie', 'phone', 'laptop', 'television', 'video game', 'alarm clock', 'light bulb', 'washing machine', 'refrigerator', 'toilet',
  'mustache', 'beard', 'glasses', 'high heels', 'bow tie', 'tattoo', 'wig', 'lipstick', 'sneakers', 'hoodie',
];

export interface CharadeItem {
  word: string;
  category: string;
}

export const CHARADES: CharadeItem[] = [
  ...['Titanic', 'Jaws', 'Frozen', 'Star Wars', 'Toy Story', 'The Lion King', 'Jurassic Park', 'Harry Potter', 'Finding Nemo', 'Spider-Man', 'Shrek', 'Ghostbusters', 'Black Panther', 'Avatar', 'Home Alone', 'The Matrix', 'Cars', 'Up', 'Barbie', 'Batman', 'King Kong', 'Pirates of the Caribbean', 'Back to the Future', 'Mean Girls'].map((word) => ({ word, category: '🎬 Movie' })),
  ...['cat', 'dog', 'snake', 'lion', 'frog', 'chicken', 'cow', 'monkey', 'bee', 'shark', 'penguin', 'elephant', 'horse', 'bat', 'kangaroo', 'pig', 'octopus', 'unicorn', 'dragon', 'whale'].map((word) => ({ word, category: '🐾 Animal' })),
  ...['sleeping', 'swimming', 'cooking', 'dancing', 'crying', 'driving', 'fishing', 'singing', 'running late', 'brushing teeth', 'taking a selfie', 'skydiving', 'surfing', 'snoring', 'sneezing', 'getting married', 'playing guitar', 'boxing', 'studying', 'falling in love'].map((word) => ({ word, category: '🏃 Action' })),
  ...['pizza', 'birthday', 'Christmas', 'Halloween', 'beach', 'rain', 'volcano', 'zombie', 'ghost', 'robot', 'astronaut', 'pirate', 'wedding', 'hospital', 'airport', 'party', 'snowman', 'fireworks', 'rainbow', 'superhero'].map((word) => ({ word, category: '✨ Thing' })),
  ...['doctor', 'chef', 'police officer', 'teacher', 'firefighter', 'pilot', 'DJ', 'magician', 'farmer', 'dentist', 'king', 'detective'].map((word) => ({ word, category: '💼 Job' })),
];

export const IMPOSTER_WORDS: Record<string, string[]> = {
  '🍔 Food': ['pizza', 'sushi', 'tacos', 'pancakes', 'ice cream', 'spaghetti', 'burger', 'popcorn', 'jollof rice', 'curry', 'donuts', 'salad'],
  '📍 Places': ['beach', 'airport', 'hospital', 'school', 'gym', 'library', 'casino', 'zoo', 'movie theater', 'museum', 'nightclub', 'supermarket'],
  '🐾 Animals': ['lion', 'penguin', 'dolphin', 'giraffe', 'owl', 'snake', 'kangaroo', 'panda', 'shark', 'parrot', 'camel', 'octopus'],
  '⚽ Sports': ['soccer', 'basketball', 'tennis', 'boxing', 'golf', 'swimming', 'skiing', 'baseball', 'volleyball', 'surfing', 'cricket', 'wrestling'],
  '🎉 Party': ['karaoke', 'birthday cake', 'balloons', 'DJ', 'disco ball', 'confetti', 'piñata', 'costume', 'fireworks', 'dance floor', 'punch bowl', 'party hat'],
  '🧰 Objects': ['umbrella', 'toothbrush', 'mirror', 'phone', 'backpack', 'candle', 'guitar', 'pillow', 'scissors', 'camera', 'clock', 'sunglasses'],
  '🦸 Characters': ['Batman', 'Mario', 'Pikachu', 'Elsa', 'Shrek', 'Harry Potter', 'Spider-Man', 'SpongeBob', 'Darth Vader', 'Barbie', 'Sherlock Holmes', 'Santa Claus'],
  '💼 Jobs': ['doctor', 'chef', 'pilot', 'teacher', 'firefighter', 'astronaut', 'farmer', 'lawyer', 'DJ', 'barber', 'detective', 'plumber'],
};
