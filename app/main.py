from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.db.session import Base, engine
from app.api.routes import router
from app.api.partner_routes import router as partner_router
from app.api.auth_routes import router as auth_router
from app.api.document_routes import router as document_router
from app.api.analytics_routes import router as analytics_router
from app.api.stub_routes import router as stub_router
from app.api.endpoint_routes import router as endpoint_router
from app.api.transaction_routes import router as transaction_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Agent Eddy — Supply Chain Transaction Intelligence",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(document_router, prefix="/api/v1")
app.include_router(partner_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(stub_router, prefix="/api/v1")
app.include_router(endpoint_router, prefix="/api/v1")
app.include_router(transaction_router, prefix="/api/v1")
