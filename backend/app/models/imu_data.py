from datetime import datetime
from sqlalchemy import Column, String, BigInteger, DateTime, Float, ForeignKey
from app.db.base import Base


class IMUData(Base):
    __tablename__ = "imu_data"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    accel_x = Column(Float, nullable=False)
    accel_y = Column(Float, nullable=False)
    accel_z = Column(Float, nullable=False)
    gyro_x = Column(Float, nullable=False)
    gyro_y = Column(Float, nullable=False)
    gyro_z = Column(Float, nullable=False)
    device_id = Column(String(50), nullable=False)
