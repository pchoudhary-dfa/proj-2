# import multiprocessing

bind = "0.0.0.0:8000"
# workers = multiprocessing.cpu_count() * 1 + 1
workers = 2
worker_class = "uvicorn.workers.UvicornWorker"
keepalive = 120
timeout = 120
