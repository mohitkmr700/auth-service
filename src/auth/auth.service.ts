import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { SignupDto } from './dto/signup.dto';
import { supabase } from '../supabase/supabase.client';
import * as dotenv from 'dotenv';
import * as jwt from 'jsonwebtoken';
import { LoginDto } from './dto/login.dto';

dotenv.config();

@Injectable()
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET!;
  private readonly TOKEN_EXPIRY = '1h';
  public static readonly TOKEN_EXPIRY_MS = 3600000; // 1 hour in milliseconds

  async signup(dto: SignupDto) {

    const { email, password, full_name, role, mobile } = dto;

    if (!email || !password) {
      throw new UnauthorizedException('Email and Password are required');
    }

    // Validate role - allow punisher, user, and customer roles
    if (role !== 'punisher' && role !== 'user' && role !== 'customer') {
      throw new UnauthorizedException(`Invalid role specified: "${role}". Allowed roles are: punisher, user, customer. Please check for typos.`);
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signupError) {
      throw new UnauthorizedException(`Signup failed: ${signupError.message}`);
    }

    const userId = signupData?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User ID is missing after signup');
    }

    const { data: profileData, error: insertError } = await supabase
      .from('profiles')
      .insert([
        {
          id: userId,
          fullname: full_name,
          role,
          phone: mobile,
          email,
        },
      ])
      .select();

    if (insertError) {
      throw new UnauthorizedException(`Error inserting user profile: ${insertError.message}`);
    }

    return {
      message: 'User created successfully'
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
  
    if (error) {
      throw new UnauthorizedException(`Login failed: ${error.message}`);
    }
  
    // Fetch the user's profile data
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
  
    if (profileError || !profileData) {
      throw new UnauthorizedException(`Failed to fetch profile data: ${profileError?.message}`);
    }
  
    // Create JWT token with user data including profile picture
    const userPayload = {
      id: data.user.id,
      email: data.user.email,
      role: profileData.role,
      full_name: profileData.fullname,
      profile_picture: profileData.avatar_url || null,
    };
  
    const token = jwt.sign(userPayload, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY,
    });
  
    return {
      message: 'Login successful',
      accessToken: token,
      expiresIn: this.TOKEN_EXPIRY
    };
  }

  verifyToken(token: string) {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
