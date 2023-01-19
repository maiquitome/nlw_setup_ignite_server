import dayjs from 'dayjs';
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from './lib/prisma'

function todayWithTimeSetToZero() {
  return dayjs().startOf('day').toDate()
}

export async function appRoutes(app: FastifyInstance) {
  app.post('/habits', async (request) => {
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(
        z.number().min(0).max(6)
      )
    })
    
    const { title, weekDays } = createHabitBody.parse(request.body)
    
    await prisma.habit.create({
      data: {
        title,
        created_at: todayWithTimeSetToZero(),
        weekDays: {
          create: weekDays.map(weekDay => {
            return {
              week_day: weekDay
            }
          })
        }
      }
    })
  })
  
  app.get('/day', async (request) => {
    const getDayParams = z.object({
      date: z.coerce.date()
    })
    
    const { date } = getDayParams.parse(request.query)
    
    const weekDay = dayjs(date).get('day')
    
    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        weekDays: {
          some: {
            week_day: weekDay,
          }
        },
      },
      include: {
        weekDays: {
          select: {
            week_day: true
          }
        },
      },
    })
    
    const day = await prisma.day.findUnique({
      where: {
        date: date,
      },
      include: {
        dayHabits: {
          select: {
            habit_id: true
          }
        }
      }
    })
    
    const completedHabits = day?.dayHabits 

    return {
      possibleHabits,
      completedHabits,
    }
  })
}
