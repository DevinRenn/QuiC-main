CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
    folder_id SERIAL PRIMARY KEY,
    folder_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_folders (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    folder_id INT REFERENCES folders(folder_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, folder_id)
);

CREATE TABLE IF NOT EXISTS sets (
    set_id SERIAL PRIMARY KEY,
    set_name VARCHAR(100) NOT NULL,
    set_description VARCHAR(300) NOT NULL
);


CREATE TABLE IF NOT EXISTS folders_to_sets (
    folder_id INT REFERENCES folders(folder_id) ON DELETE CASCADE,
    set_id INT REFERENCES sets(set_id) ON DELETE CASCADE,
    PRIMARY KEY (folder_id, set_id)
);

CREATE TABLE IF NOT EXISTS cards (
    card_id SERIAL PRIMARY KEY,
    front_text VARCHAR(300) NOT NULL,
    back_text VARCHAR(300) NOT NULL
);

CREATE TABLE IF NOT EXISTS sets_to_cards (
    set_id INT REFERENCES sets(set_id) ON DELETE CASCADE,
    card_id INT REFERENCES cards(card_id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, card_id)
);