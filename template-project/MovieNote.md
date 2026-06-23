---
tags:
  - Movie
---
# Movie Notes

Here we test project-level isolation:
Rating: {{ movie/movie_data.json:movie.rating | run="movie/rating_fetcher.py" & isolate="project" }}
Thread: {{ movie/movie_data.json:movie.thread }}

Here we test window-level isolation:
Rating Window: {{ movie/movie_data.json:movie.rating | run="movie/rating_fetcher.py" & isolate="window" }}
Thread Window: {{ movie/movie_data_editor-root.json:movie.thread }}

Here we test execution-level isolation:
Rating Exec: {{ movie/movie_data.json:movie.rating | run="movie/rating_fetcher.py" & isolate="execution" }}
