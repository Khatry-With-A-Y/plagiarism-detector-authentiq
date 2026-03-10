# import nltk
# from nltk.corpus import stopwords
# from nltk.stem import WordNetLemmatizer
# from nltk.tokenize import word_tokenize

# stop_words = set(stopwords.words("english"))
# lemmatizer = WordNetLemmatizer()

# def preprocess(text):

#     tokens = word_tokenize(text.lower())

#     tokens = [t for t in tokens if t.isalpha()]

#     tokens = [t for t in tokens if t not in stop_words]

#     tokens = [lemmatizer.lemmatize(t) for t in tokens]

#     return tokens