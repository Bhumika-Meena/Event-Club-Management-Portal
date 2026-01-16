const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');

const prisma = new PrismaClient();

// Get all events
const getAllEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, clubId } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (clubId) where.clubId = clubId;

    const events = await prisma.event.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        club: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        },
        _count: {
          select: {
            bookings: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    const total = await prisma.event.count({ where });

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single event
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        club: {
          select: {
            id: true,
            name: true,
            logo: true,
            description: true
          }
        },
        bookings: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create event
const createEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      venue,
      date,
      maxSeats,
      price = 0,
      clubId
    } = req.body;

    // Check if user owns the club
    const club = await prisma.club.findFirst({
      where: {
        id: clubId,
        ownerId: req.user.id
      }
    });

    if (!club) {
      return res.status(403).json({ message: 'You can only create events for your own club' });
    }

    const event = await prisma.event.create({
      data: {
        title,
        description,
        venue,
        date: new Date(date),
        maxSeats: parseInt(maxSeats),
        price: parseFloat(price),
        creatorId: req.user.id,
        clubId
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Event created successfully',
      event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update event
const updateEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if user owns the event
    const existingEvent = await prisma.event.findFirst({
      where: {
        id,
        creatorId: req.user.id
      }
    });

    if (!existingEvent) {
      return res.status(403).json({ message: 'You can only update your own events' });
    }

    // Convert date if provided
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        club: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        }
      }
    });

    res.json({
      message: 'Event updated successfully',
      event
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete event
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user owns the event
    const existingEvent = await prisma.event.findFirst({
      where: {
        id,
        creatorId: req.user.id
      }
    });

    if (!existingEvent) {
      return res.status(403).json({ message: 'You can only delete your own events' });
    }

    await prisma.event.delete({
      where: { id }
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Book event
const bookEvent = async (req, res) => {
  try {
    const { eventId } = req.body;

    // Check if event exists and is approved
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: {
            bookings: true
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Event is not available for booking' });
    }

    // Check if already booked
    const existingBooking = await prisma.booking.findUnique({
      where: {
        userId_eventId: {
          userId: req.user.id,
          eventId
        }
      }
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'You have already booked this event' });
    }

    // Check if seats are available
    if (event._count.bookings >= event.maxSeats) {
      return res.status(400).json({ message: 'No seats available' });
    }

    // Generate QR code
    const qrCodeData = `${req.user.id}-${eventId}-${Date.now()}`;
    const qrCode = await QRCode.toDataURL(qrCodeData);

    const booking = await prisma.booking.create({
      data: {
        userId: req.user.id,
        eventId,
        qrCode: qrCodeData
      },
      include: {
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

    res.status(201).json({
      message: 'Event booked successfully',
      booking,
      qrCodeImage: qrCode
    });
  } catch (error) {
    console.error('Book event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Validation rules
const eventValidation = [
  body('title').trim().isLength({ min: 1 }),
  body('description').trim().isLength({ min: 1 }),
  body('venue').trim().isLength({ min: 1 }),
  body('date').isISO8601(),
  body('maxSeats').isInt({ min: 1 }),
  body('price').optional().isFloat({ min: 0 }),
  body('clubId').trim().isLength({ min: 1 })
];

const bookingValidation = [
  body('eventId').isUUID()
];

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  bookEvent,
  eventValidation,
  bookingValidation
};
