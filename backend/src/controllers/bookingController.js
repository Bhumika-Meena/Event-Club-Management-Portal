const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get user's bookings
const getUserBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user.id },
      include: {
        event: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                logo: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ bookings });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        userId: req.user.id
      },
      include: {
        event: true
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if event has already started
    if (new Date(booking.event.date) <= new Date()) {
      return res.status(400).json({ message: 'Cannot cancel booking for past events' });
    }

    await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify QR code (for event check-in)
const verifyQRCode = async (req, res) => {
  try {
    const { qrCode } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { qrCode },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            venue: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Invalid QR code' });
    }

    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({ message: 'Booking is not confirmed' });
    }

    // Check if event has started
    const eventDate = new Date(booking.event.date);
    const now = new Date();
    
    if (eventDate > now) {
      return res.status(400).json({ message: 'Event has not started yet' });
    }

    // Mark as checked in
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN' }
    });

    res.json({
      message: 'Check-in successful',
      booking: {
        ...booking,
        status: 'CHECKED_IN'
      }
    });
  } catch (error) {
    console.error('Verify QR code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getUserBookings,
  cancelBooking,
  verifyQRCode
};
